"""HTTP and WebSocket API for the audio bridge."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from lemonslice_bridge.audio import BRIDGE_SAMPLE_RATE
from lemonslice_bridge.bridge import AudioBridge, InterruptSource
from lemonslice_bridge.elevenlabs import ElevenLabsError
from lemonslice_bridge.lemonslice import LemonSliceError, LemonSliceSession, create_session
from lemonslice_bridge.rooms import create_livekit_room

EXAMPLE_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(EXAMPLE_ROOT / ".env.local")
load_dotenv(EXAMPLE_ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("lemonslice_bridge.server")

SESSION_CLAIM_TIMEOUT_SECONDS = 300

app = FastAPI(title="ElevenLabs x LemonSlice avatar bridge")


@dataclass
class PendingSession:
    session: LemonSliceSession
    created_at: float


_pending: dict[str, PendingSession] = {}


@app.post("/api/session")
async def create_bridge_session() -> dict:
    _expire_stale_sessions()

    try:
        room = create_livekit_room()
        session = await create_session(room)
    except KeyError as exc:
        raise HTTPException(
            status_code=500, detail=f"Missing environment variable {exc.args[0]}"
        ) from exc
    except LemonSliceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    bridge_id = uuid.uuid4().hex
    _pending[bridge_id] = PendingSession(session=session, created_at=time.monotonic())
    logger.info(
        "Session %s ready (LemonSlice %s, LiveKit room %s)",
        bridge_id,
        session.session_id,
        room.name,
    )

    return {
        "bridge_id": bridge_id,
        "livekit_url": room.url,
        "livekit_token": room.viewer_token,
        "room": room.name,
        "sample_rate": BRIDGE_SAMPLE_RATE,
    }


def _expire_stale_sessions() -> None:
    cutoff = time.monotonic() - SESSION_CLAIM_TIMEOUT_SECONDS
    for bridge_id in [key for key, value in _pending.items() if value.created_at < cutoff]:
        logger.info("Discarding unclaimed session %s", bridge_id)
        _pending.pop(bridge_id, None)


@app.websocket("/api/bridge/{bridge_id}")
async def bridge_socket(websocket: WebSocket, bridge_id: str) -> None:
    await websocket.accept()

    pending = _pending.pop(bridge_id, None)
    if pending is None:
        await _send(websocket, {"type": "error", "message": "Unknown or already-claimed session"})
        await websocket.close(code=4404)
        return

    send_lock = asyncio.Lock()

    async def emit(event: dict) -> None:
        async with send_lock:
            await _send(websocket, event)

    bridge = AudioBridge(pending.session, emit)

    try:
        await bridge.start()
    except KeyError as exc:
        message = f"Missing environment variable {exc.args[0]}"
        logger.warning("Session %s failed to start: %s", bridge_id, message)
        await emit({"type": "error", "message": message})
        await bridge.aclose()
        await websocket.close(code=1011)
        return
    except (ElevenLabsError, LemonSliceError) as exc:
        logger.warning("Session %s failed to start: %s", bridge_id, exc)
        await emit({"type": "error", "message": str(exc)})
        await bridge.aclose()
        await websocket.close(code=1011)
        return

    await emit({"type": "bridge_ready", "sample_rate": BRIDGE_SAMPLE_RATE})

    try:
        await _receive_loop(websocket, bridge)
    except WebSocketDisconnect:
        logger.info("Session %s: browser disconnected", bridge_id)
    except Exception:
        logger.exception("Session %s failed", bridge_id)
    finally:
        await bridge.aclose()
        logger.info("Session %s closed", bridge_id)
        with contextlib.suppress(Exception):
            await websocket.close()


async def _receive_loop(websocket: WebSocket, bridge: AudioBridge) -> None:
    while True:
        message = await websocket.receive()

        if message.get("type") == "websocket.disconnect":
            raise WebSocketDisconnect(message.get("code", 1000))

        payload = message.get("bytes")
        if payload:
            await bridge.send_user_audio(payload)
            continue

        text = message.get("text")
        if not text:
            continue

        try:
            command = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(command, dict):
            await _handle_command(command, bridge)


async def _handle_command(command: dict, bridge: AudioBridge) -> None:
    kind = command.get("type")

    if kind == "interrupt":
        await bridge.interrupt(InterruptSource.USER)
    elif kind == "user_message":
        text = str(command.get("text", "")).strip()
        if text:
            await bridge.send_user_message(text)
    else:
        logger.debug("Unhandled browser command: %s", kind)


async def _send(websocket: WebSocket, event: dict) -> None:
    with contextlib.suppress(Exception):
        await websocket.send_text(json.dumps(event))
