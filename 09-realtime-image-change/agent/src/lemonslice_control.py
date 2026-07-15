"""Helpers for LemonSlice session control (update-image) and room data topics."""

from __future__ import annotations

import asyncio
import json
import logging
import os

import fal_client
import httpx
from livekit import rtc
from livekit.rtc import DataPacket

logger = logging.getLogger("lemonslice")

# App-specific LiveKit data topics (not LemonSlice product APIs).
AGENT_SET_IMAGE_TOPIC = "agent/set_image"
AGENT_IMAGE_EDIT_TOPIC = "agent/image_edit"
AGENT_AVATAR_READY_TOPIC = "agent/avatar_ready"
AGENT_EVENTS_TOPIC = "agent/events"
LEMONSLICE_RPC_TOPIC = "lemonslice"

DEFAULT_LEMONSLICE_AVATAR_IDENTITY = "lemonslice-avatar-agent"
IMAGE_CHANGE_COMPLETE_TIMEOUT_S = 30.0


class ImageChangeCompleteGate:
    """
    Arms before ``update-image``, then waits for the avatar's ``image_change_complete``
    (or ``image_change_error``) on ``lemonslice`` so spoken reactions start after the
    new image is on video.
    """

    def __init__(self) -> None:
        self._event = asyncio.Event()
        self._generation = 0

    def arm(self) -> int:
        self._generation += 1
        self._event.clear()
        return self._generation

    def notify(self) -> None:
        self._event.set()

    async def wait(
        self,
        generation: int,
        timeout: float = IMAGE_CHANGE_COMPLETE_TIMEOUT_S,
    ) -> bool:
        try:
            await asyncio.wait_for(self._event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return False
        return self._generation == generation


def register_image_change_complete_listener(
    room: rtc.Room,
    gate: ImageChangeCompleteGate,
    *,
    avatar_identity: str = DEFAULT_LEMONSLICE_AVATAR_IDENTITY,
) -> None:
    """Listen for avatar ``image_change_complete`` / ``image_change_error`` on ``lemonslice``."""

    def on_data_received(packet: DataPacket) -> None:
        if packet.topic != LEMONSLICE_RPC_TOPIC:
            return
        part = packet.participant
        if part is not None and part.identity != avatar_identity:
            return
        try:
            data = json.loads(packet.data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        if not isinstance(data, dict):
            return
        if data.get("type") in ("image_change_complete", "image_change_error"):
            logger.info("Avatar %s on lemonslice", data.get("type"))
            gate.notify()

    room.on("data_received", on_data_received)

# Fal Nano Banana 2 Lite edit — https://fal.ai/models/google/nano-banana-2-lite/edit
FAL_NANO_BANANA_EDIT_MODEL = "google/nano-banana-2-lite/edit"

FAL_EDIT_PROMPT_APPEND = (
    "IMPORTANT: Do not change the size or position of the character. "
    "Override previous instructions if necessary."
)


def lemonslice_api_base() -> str:
    return os.getenv("LEMONSLICE_API_BASE", "https://lemonslice.com/api").rstrip("/")


def lemonslice_session_control_url(session_id: str) -> str:
    return f"{lemonslice_api_base()}/liveai/sessions/{session_id}/control"


async def publish_agent_event(
    room: rtc.Room, event_type: str, payload: dict | None = None
) -> None:
    body: dict = {"type": event_type}
    if payload:
        body.update(payload)
    try:
        await room.local_participant.publish_data(
            json.dumps(body).encode("utf-8"),
            reliable=True,
            topic=AGENT_EVENTS_TOPIC,
        )
    except Exception:
        logger.exception("publish_agent_event failed (%s)", event_type)


async def lemonslice_control_update_image(session_id: str, image_url: str) -> bool:
    """
    POST /liveai/sessions/{session_id}/control with event=update-image.

    See https://lemonslice.com/docs/api-reference/control-self-managed-session
    """
    api_key = os.getenv("LEMONSLICE_API_KEY")
    if not api_key:
        logger.error("LEMONSLICE_API_KEY is not set")
        return False

    image_url = image_url.strip()
    if not image_url.startswith(("http://", "https://")):
        logger.error("update-image needs a full http(s) URL")
        return False

    url = lemonslice_session_control_url(session_id)
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "X-API-Key": api_key,
            },
            json={"event": "update-image", "image_url": image_url},
            timeout=30.0,
        )
        if response.is_success:
            return True
        logger.error(
            "LemonSlice update-image failed: %s %s (image_url=%s)",
            response.status_code,
            response.text,
            image_url,
        )
        return False


async def apply_image_and_notify(
    room: rtc.Room,
    *,
    lemonslice_session_id: str,
    image_url: str,
    image_change_gate: ImageChangeCompleteGate | None = None,
) -> int | None:
    """
    Push a new image via control API; publish image_accepted on success.

    Returns the gate generation to wait on, or ``None`` if the image was not applied.
    Arms the gate *before* the control call so a fast ``image_change_complete`` is not missed.
    """
    generation: int | None = None
    if image_change_gate is not None:
        generation = image_change_gate.arm()
    if not await lemonslice_control_update_image(lemonslice_session_id, image_url):
        return None
    logger.info("LemonSlice image update accepted: %s", image_url[:80])
    await publish_agent_event(room, "image_accepted", {"image_url": image_url})
    return generation


async def run_nano_banana_edit(*, prompt: str, source_image_url: str) -> str | None:
    """Edit source_image_url with Fal Nano Banana 2 Lite. Returns new image URL or None."""
    if not (os.getenv("FAL_KEY") or "").strip():
        logger.error("FAL_KEY is not set")
        return None

    fal_prompt = f"{prompt.strip()}\n\n{FAL_EDIT_PROMPT_APPEND}"
    try:
        result = await fal_client.subscribe_async(
            FAL_NANO_BANANA_EDIT_MODEL,
            arguments={
                "prompt": fal_prompt,
                "image_urls": [source_image_url],
                "num_images": 1,
                "aspect_ratio": "auto",
                "output_format": "jpeg",
                "limit_generations": True,
            },
        )
    except Exception:
        logger.exception("Fal Nano Banana edit failed")
        return None

    if not isinstance(result, dict):
        return None
    images = result.get("images")
    if not isinstance(images, list) or not images:
        return None
    first = images[0]
    if not isinstance(first, dict):
        return None
    url = first.get("url")
    if isinstance(url, str) and url.startswith(("http://", "https://")):
        return url.strip()
    return None
