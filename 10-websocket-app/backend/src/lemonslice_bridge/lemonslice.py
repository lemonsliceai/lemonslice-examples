"""LemonSlice session creation and WebSocket audio tunnel."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx
import websockets

from lemonslice_bridge.rooms import LiveKitRoom

logger = logging.getLogger(__name__)
LEMONSLICE_SESSIONS_URL = "https://lemonslice.com/api/liveai/sessions"
AGENT_IMAGE_URL = (
    "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/"
    "inf2-image-uploads/image_9d0f6-WhaKqLKTzfVHlfe5jXzHE8Rpi9peF4.jpg"
)


class LemonSliceError(RuntimeError):
    """A LemonSlice API or tunnel failure."""


@dataclass(frozen=True)
class LemonSliceSession:
    session_id: str
    websocket_address: str


async def create_session(room: LiveKitRoom) -> LemonSliceSession:
    payload: dict[str, object] = {
        "transport_type": "websocket-livekit",
        "livekit_properties": {
            "livekit_url": room.url,
            "livekit_token": room.avatar_token,
        },
        "agent_image_url": AGENT_IMAGE_URL,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            response = await client.post(
                LEMONSLICE_SESSIONS_URL,
                headers={
                    "X-API-Key": os.environ["LEMONSLICE_API_KEY"],
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except httpx.HTTPError as exc:
            raise LemonSliceError(f"Could not reach the LemonSlice sessions API: {exc}") from exc

    if response.status_code >= 400:
        raise LemonSliceError(f"LemonSlice rejected the session: {_error_detail(response)}")

    try:
        data = response.json()
    except ValueError as exc:
        raise LemonSliceError("LemonSlice session response is not valid JSON") from exc
    websocket_address = data.get("websocket_address")
    if not websocket_address:
        raise LemonSliceError("LemonSlice session response is missing websocket_address")
    return LemonSliceSession(
        session_id=data.get("session_id", ""),
        websocket_address=websocket_address,
    )


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return f"HTTP {response.status_code}: {response.text[:400]}"
    detail = body.get("detail") or body.get("error") or body
    return f"HTTP {response.status_code}: {detail}"


class LemonSliceTunnel:
    """Audio ingress to the avatar renderer."""

    def __init__(
        self,
        address: str,
        *,
        on_event: Callable[[dict], Awaitable[None]],
        on_message: Callable[[str, dict], Awaitable[None]],
    ) -> None:
        self._address = address
        self._on_event = on_event
        self._on_message = on_message
        self._websocket: websockets.ClientConnection | None = None
        self._receive_task: asyncio.Task | None = None
        self._send_lock = asyncio.Lock()

    async def connect(self) -> None:
        try:
            self._websocket = await websockets.connect(self._address, max_size=None)
        except Exception as exc:  # noqa: BLE001
            raise LemonSliceError(f"Could not open the LemonSlice tunnel: {exc}") from exc
        self._receive_task = asyncio.create_task(self._receive_loop(), name="lemonslice-receive")

    async def send_audio(self, pcm16: bytes, sample_rate: int) -> None:
        await self._send(
            {
                "command": "audio",
                "audio": base64.b64encode(pcm16).decode("ascii"),
                "sampleRate": sample_rate,
                "encoding": "PCM16",
            }
        )

    async def send_audio_end(self) -> None:
        await self._send({"command": "audio_end"})

    async def send_interrupt(self) -> None:
        await self._send({"command": "interrupt"})

    async def send_terminate(self) -> None:
        await self._send({"command": "terminate"})

    async def aclose(self) -> None:
        if self._receive_task:
            self._receive_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._receive_task
        self._receive_task = None
        if self._websocket:
            with contextlib.suppress(Exception):
                await self._websocket.close()
            self._websocket = None

    async def _send(self, message: dict) -> None:
        websocket = self._websocket
        if websocket is None:
            logger.debug("Dropping %s: tunnel is closed", message.get("command"))
            return
        try:
            async with self._send_lock:
                await websocket.send(json.dumps(message))
            await self._on_message("out", _display_message(message))
        except Exception:
            logger.warning(
                "Failed to send %s to the LemonSlice tunnel",
                message.get("command"),
                exc_info=True,
            )

    async def _receive_loop(self) -> None:
        websocket = self._websocket
        if websocket is None:
            return
        try:
            async for raw in websocket:
                if isinstance(raw, bytes):
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("Ignoring non-JSON tunnel message")
                    continue
                if isinstance(event, dict):
                    await self._on_message("in", event)
                    await self._on_event(event)
        except asyncio.CancelledError:
            raise
        except websockets.exceptions.ConnectionClosed:
            logger.info("LemonSlice tunnel closed")
        except Exception:
            logger.exception("LemonSlice tunnel receive loop failed")


def _display_message(message: dict) -> dict:
    if message.get("command") != "audio":
        return message
    audio = message.get("audio", "")
    return {**message, "audio": f"<{len(audio)} base64 chars>"}

