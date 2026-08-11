"""ElevenLabs Agents ("convai") WebSocket client."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import websockets

from lemonslice_bridge.audio import (
    AudioFormat,
    BRIDGE_SAMPLE_RATE,
    from_bridge_pcm16,
    parse_audio_format,
    to_bridge_pcm16,
)

logger = logging.getLogger(__name__)
ELEVENLABS_WEBSOCKET_URL = "wss://api.elevenlabs.io/v1/convai/conversation"
KEEPALIVE_INTERVAL_SECONDS = 20


class ElevenLabsError(RuntimeError):
    """An ElevenLabs API or WebSocket failure."""


@dataclass(frozen=True)
class AgentAudioChunk:
    pcm16: bytes
    sample_rate: int
    event_id: int


@dataclass
class ElevenLabsCallbacks:
    on_ready: Callable[[str], Awaitable[None]]
    on_audio: Callable[[AgentAudioChunk], Awaitable[None]]
    on_interruption: Callable[[int], Awaitable[None]]
    on_agent_response: Callable[[str], Awaitable[None]]
    on_user_transcript: Callable[[str], Awaitable[None]]
    on_closed: Callable[[str], Awaitable[None]]


class ElevenLabsAgent:
    """A single conversation with an ElevenLabs agent."""

    def __init__(self, callbacks: ElevenLabsCallbacks) -> None:
        self._callbacks = callbacks
        self._websocket: websockets.ClientConnection | None = None
        self._receive_task: asyncio.Task | None = None
        self._keepalive_task: asyncio.Task | None = None
        self._send_lock = asyncio.Lock()
        self._last_send_time = 0.0

        self.conversation_id: str | None = None
        self.output_format = AudioFormat("pcm", BRIDGE_SAMPLE_RATE)
        self.input_format = AudioFormat("pcm", BRIDGE_SAMPLE_RATE)

    async def connect(self) -> None:
        url = f"{ELEVENLABS_WEBSOCKET_URL}?agent_id={os.environ['ELEVENLABS_AGENT_ID']}"
        try:
            self._websocket = await websockets.connect(
                url,
                subprotocols=[websockets.Subprotocol("convai")],
                max_size=None,
            )
        except Exception as exc:  # noqa: BLE001 - surfaced to the browser as a session error
            raise ElevenLabsError(f"Could not open the ElevenLabs WebSocket: {exc}") from exc

        logger.info("ElevenLabs agent WebSocket connected")
        await self._send({"type": "conversation_initiation_client_data"})

        self._receive_task = asyncio.create_task(self._receive_loop(), name="elevenlabs-receive")
        self._keepalive_task = asyncio.create_task(
            self._keepalive_loop(), name="elevenlabs-keepalive"
        )

    async def send_user_audio(self, pcm16: bytes) -> None:
        payload = from_bridge_pcm16(pcm16, BRIDGE_SAMPLE_RATE, self.input_format)
        await self._send({"user_audio_chunk": base64.b64encode(payload).decode("ascii")})

    async def send_user_message(self, text: str) -> None:
        await self._send({"type": "user_message", "text": text})

    async def send_user_activity(self) -> None:
        await self._send({"type": "user_activity"})

    async def aclose(self) -> None:
        for task in (self._keepalive_task, self._receive_task):
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        self._keepalive_task = None
        self._receive_task = None

        if self._websocket:
            with contextlib.suppress(Exception):
                await self._websocket.close()
            self._websocket = None

    async def _send(self, message: dict) -> None:
        websocket = self._websocket
        if websocket is None:
            logger.debug("Dropping message to a closed ElevenLabs socket")
            return
        try:
            async with self._send_lock:
                await websocket.send(json.dumps(message))
            self._last_send_time = time.monotonic()
        except Exception:
            logger.warning("Failed to send a message to ElevenLabs", exc_info=True)

    async def _receive_loop(self) -> None:
        websocket = self._websocket
        if websocket is None:
            return
        reason = "closed"
        try:
            async for raw in websocket:
                if isinstance(raw, bytes):
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("Ignoring non-JSON ElevenLabs message")
                    continue
                if isinstance(event, dict):
                    await self._handle_event(event)
        except asyncio.CancelledError:
            raise
        except websockets.exceptions.ConnectionClosed as exc:
            reason = exc.reason or f"closed with code {exc.code}"
            logger.info("ElevenLabs WebSocket closed: %s", reason)
        except Exception as exc:  # noqa: BLE001 - reported to the browser
            reason = str(exc)
            logger.exception("ElevenLabs receive loop failed")
        finally:
            with contextlib.suppress(Exception):
                await self._callbacks.on_closed(reason)

    async def _handle_event(self, event: dict) -> None:
        event_type = event.get("type")

        if event_type == "audio":
            await self._handle_audio(event.get("audio_event") or {})

        elif event_type == "interruption":
            event_id = int((event.get("interruption_event") or {}).get("event_id", 0))
            await self._callbacks.on_interruption(event_id)

        elif event_type == "agent_response":
            text = (event.get("agent_response_event") or {}).get("agent_response", "")
            await self._callbacks.on_agent_response(text)

        elif event_type == "user_transcript":
            text = (event.get("user_transcription_event") or {}).get("user_transcript", "")
            await self._callbacks.on_user_transcript(text)

        elif event_type == "ping":
            ping = event.get("ping_event") or {}
            await self._send({"type": "pong", "event_id": ping.get("event_id")})

        elif event_type == "conversation_initiation_metadata":
            await self._handle_metadata(event.get("conversation_initiation_metadata_event") or {})

        elif event_type == "error":
            logger.error("ElevenLabs reported an error: %s", event.get("error_event") or {})

        else:
            logger.debug("Unhandled ElevenLabs event: %s", event_type)

    async def _handle_metadata(self, metadata: dict) -> None:
        self.conversation_id = metadata.get("conversation_id")
        self.output_format = parse_audio_format(metadata.get("agent_output_audio_format"))
        self.input_format = parse_audio_format(metadata.get("user_input_audio_format"))
        logger.info(
            "ElevenLabs conversation %s ready (agent out=%s, user in=%s)",
            self.conversation_id,
            self.output_format,
            self.input_format,
        )
        await self._callbacks.on_ready(self.conversation_id or "")

    async def _handle_audio(self, audio_event: dict) -> None:
        encoded = audio_event.get("audio_base_64")
        if not encoded:
            return
        try:
            raw = base64.b64decode(encoded)
        except (ValueError, TypeError):
            logger.warning("Ignoring an undecodable ElevenLabs audio chunk")
            return

        pcm16 = to_bridge_pcm16(raw, self.output_format, BRIDGE_SAMPLE_RATE)
        await self._callbacks.on_audio(
            AgentAudioChunk(
                pcm16=pcm16,
                sample_rate=BRIDGE_SAMPLE_RATE,
                event_id=int(audio_event.get("event_id", 0)),
            )
        )

    async def _keepalive_loop(self) -> None:
        try:
            self._last_send_time = time.monotonic()
            while True:
                idle_for = time.monotonic() - self._last_send_time
                if idle_for < KEEPALIVE_INTERVAL_SECONDS:
                    await asyncio.sleep(KEEPALIVE_INTERVAL_SECONDS - idle_for)
                    continue
                await self.send_user_activity()
        except asyncio.CancelledError:
            raise
