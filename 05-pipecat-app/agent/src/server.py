from __future__ import annotations

import asyncio
import os
import pathlib
from dataclasses import dataclass
from typing import Any

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.transports.lemonslice.transport import (
    LemonSliceNewSessionRequest,
    LemonSliceParams,
    LemonSliceTransport,
)

# Project root is two levels above this file: 05-pipecat-app/
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local")

app = FastAPI(title="LemonSlice Pipecat Session API")


@dataclass
class ActiveSession:
    pipeline_task: PipelineTask
    runner_task: asyncio.Task[None]
    http_session: aiohttp.ClientSession
    context: LLMContext


class MessageRequest(BaseModel):
    message: str


class SessionRequest(BaseModel):
    daily_room_url: str
    daily_token: str


_session_lock = asyncio.Lock()
_active_session: ActiveSession | None = None


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


async def _stop_active_session() -> None:
    global _active_session
    if _active_session is None:
        return

    try:
        await _active_session.pipeline_task.cancel()
    except Exception as exc:
        logger.warning(f"Error cancelling active pipeline: {exc}")

    try:
        await _active_session.runner_task
    except Exception as exc:
        logger.warning(f"Error awaiting runner task: {exc}")

    try:
        await _active_session.http_session.close()
    except Exception as exc:
        logger.warning(f"Error closing aiohttp session: {exc}")

    _active_session = None


async def _create_session(request: SessionRequest) -> dict[str, str]:
    global _active_session

    lemonslice_api_key = _required_env("LEMONSLICE_API_KEY")
    deepgram_api_key = _required_env("DEEPGRAM_API_KEY")
    groq_api_key = _required_env("GROQ_API_KEY")
    elevenlabs_api_key = _required_env("ELEVENLABS_API_KEY")
    elevenlabs_voice_id = _required_env("ELEVENLABS_VOICE_ID")
    bot_name = os.getenv("PIPECAT_BOT_NAME", "Pipecat")
    agent_id = os.getenv("LEMONSLICE_AGENT_ID")
    agent_image_url = os.getenv("LEMONSLICE_AGENT_IMAGE_URL")

    if not agent_id and not agent_image_url:
        raise RuntimeError("Set either LEMONSLICE_AGENT_ID or LEMONSLICE_AGENT_IMAGE_URL")

    http_session = aiohttp.ClientSession()
    transport = LemonSliceTransport(
        bot_name=bot_name,
        api_key=lemonslice_api_key,
        session=http_session,
        session_request=LemonSliceNewSessionRequest(
            agent_id=agent_id,
            agent_image_url=agent_image_url,
            idle_timeout=int(os.getenv("LEMONSLICE_IDLE_TIMEOUT", "120")),
            daily_room_url=request.daily_room_url,
            daily_token=request.daily_token,
        ),
        params=LemonSliceParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            microphone_out_enabled=False,
        ),
    )

    stt = DeepgramSTTService(api_key=deepgram_api_key)
    llm = GroqLLMService(
        api_key=groq_api_key,
        settings=GroqLLMService.Settings(
            system_instruction=(
                "You are a helpful assistant in a voice conversation. "
                "Keep answers brief and natural for spoken delivery."
            ),
        ),
    )
    tts = ElevenLabsTTSService(
        api_key=elevenlabs_api_key,
        settings=ElevenLabsTTSService.Settings(
            voice=elevenlabs_voice_id,
        ),
    )

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport: LemonSliceTransport, participant: Any):
        logger.info(f"Client connected: {participant.get('id')}")
        context.add_message(
            {"role": "developer", "content": "Start by greeting the user and ask how you can help."}
        )
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport: LemonSliceTransport, participant: Any):
        logger.info(f"Client disconnected: {participant.get('id')}")
        await task.cancel()

    @transport.event_handler("on_avatar_connected")
    async def on_avatar_connected(transport: LemonSliceTransport, participant: Any):
        logger.info(f"Avatar connected: {participant.get('id')}")

    @transport.event_handler("on_avatar_disconnected")
    async def on_avatar_disconnected(
        transport: LemonSliceTransport, participant: Any, reason: str
    ):
        logger.info(f"Avatar disconnected: {reason}")

    runner = PipelineRunner()
    runner_task = asyncio.create_task(runner.run(task))

    _active_session = ActiveSession(
        pipeline_task=task,
        runner_task=runner_task,
        http_session=http_session,
        context=context,
    )

    return {"room_url": request.daily_room_url}


@app.get("/healthz")
async def healthcheck():
    return {"ok": True}


@app.post("/session")
async def create_session(request: SessionRequest):
    async with _session_lock:
        try:
            await _stop_active_session()
            payload = await _create_session(request)
            return JSONResponse(payload)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Failed creating Pipecat session")
            raise HTTPException(status_code=500, detail=f"Failed creating session: {exc}") from exc


@app.delete("/session")
async def stop_session():
    async with _session_lock:
        await _stop_active_session()
        return {"stopped": True}


@app.post("/message")
async def send_message(request: MessageRequest):
    async with _session_lock:
        if _active_session is None:
            raise HTTPException(status_code=400, detail="No active session")

        text = request.message.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        _active_session.context.add_message({"role": "user", "content": text})
        await _active_session.pipeline_task.queue_frames([LLMRunFrame()])
        return {"queued": True}
