"""Helpers for LemonSlice session control (update-image) and room data topics."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from io import BytesIO
from pathlib import Path
from typing import Literal

import fal_client
import httpx
from livekit import rtc
from livekit.rtc import DataPacket
from PIL import Image

logger = logging.getLogger("lemonslice")

# App-specific LiveKit data topics (not LemonSlice product APIs).
AGENT_SET_IMAGE_TOPIC = "agent/set_image"
AGENT_IMAGE_EDIT_TOPIC = "agent/image_edit"
AGENT_EVENTS_TOPIC = "agent/events"
LEMONSLICE_RPC_TOPIC = "lemonslice"

DEFAULT_LEMONSLICE_AVATAR_IDENTITY = "lemonslice-avatar-agent"
IMAGE_CHANGE_COMPLETE_TIMEOUT_S = 30.0

# Match LemonSlice 2x3 portrait output (width x height).
TARGET_IMAGE_WIDTH = 368
TARGET_IMAGE_HEIGHT = 560


ImageChangeOutcome = Literal["complete", "error"]


class ImageChangeCompleteGate:
    """
    Arms before ``update-image``, then waits for the avatar's terminal
    ``image_change_complete`` / ``image_change_error`` on ``lemonslice``.
    """

    def __init__(self) -> None:
        self._event = asyncio.Event()
        self._generation = 0
        self._outcome: ImageChangeOutcome | None = None

    def arm(self) -> int:
        self._generation += 1
        self._outcome = None
        self._event.clear()
        return self._generation

    def notify(self, outcome: ImageChangeOutcome) -> None:
        self._outcome = outcome
        self._event.set()

    async def wait(
        self,
        generation: int,
        timeout: float = IMAGE_CHANGE_COMPLETE_TIMEOUT_S,
    ) -> ImageChangeOutcome | None:
        """Return ``complete`` / ``error``, or ``None`` on timeout / stale generation."""
        try:
            await asyncio.wait_for(self._event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return None
        if self._generation != generation:
            return None
        return self._outcome


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
        event_type = data.get("type")
        if event_type == "image_change_complete":
            logger.info("Avatar image_change_complete on lemonslice")
            gate.notify("complete")
        elif event_type == "image_change_error":
            logger.info("Avatar image_change_error on lemonslice")
            gate.notify("error")

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


def center_crop_resize(img: Image.Image, width: int, height: int) -> Image.Image:
    """Center-crop and resize to target while preserving target aspect ratio."""
    src_w, src_h = img.size
    target_ratio = width / height
    img_ratio = src_w / src_h
    if img_ratio > target_ratio:
        new_w = int(src_h * target_ratio)
        left = (src_w - new_w) / 2
        box = (left, 0, left + new_w, src_h)
    else:
        new_h = int(src_w / target_ratio)
        top = (src_h - new_h) / 2
        box = (0, top, src_w, top + new_h)
    return img.crop(box).resize((width, height), Image.LANCZOS)


def image_bytes_to_jpeg_base64(
    image_bytes: bytes,
    *,
    width: int = TARGET_IMAGE_WIDTH,
    height: int = TARGET_IMAGE_HEIGHT,
    quality: int = 90,
) -> str:
    """Decode arbitrary image bytes, center-crop resize, return raw base64 JPEG."""
    img = Image.open(BytesIO(image_bytes))
    img = img.convert("RGB")
    img = center_crop_resize(img, width, height)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def load_local_image_base64(path: Path) -> str:
    """Load a local image file and return center-crop-resized JPEG base64."""
    return image_bytes_to_jpeg_base64(path.read_bytes())


def decode_image_base64_field(raw: str) -> bytes:
    """Accept raw base64 or a data URL; return decoded bytes."""
    value = raw.strip()
    if value.startswith("data:"):
        _, _, value = value.partition(",")
    return base64.b64decode(value, validate=True)


async def lemonslice_control_update_image(
    session_id: str,
    *,
    image_url: str | None = None,
    image_base64: str | None = None,
) -> bool:
    """
    POST /liveai/sessions/{session_id}/control with event=update-image.

    Provide exactly one of ``image_url`` or ``image_base64``.
    See https://lemonslice.com/docs/api-reference/control-self-managed-session
    """
    api_key = os.getenv("LEMONSLICE_API_KEY")
    if not api_key:
        logger.error("LEMONSLICE_API_KEY is not set")
        return False

    if bool(image_url) == bool(image_base64):
        logger.error("update-image needs exactly one of image_url or image_base64")
        return False

    body: dict = {"event": "update-image"}
    if image_url:
        image_url = image_url.strip()
        if not image_url.startswith(("http://", "https://")):
            logger.error("update-image image_url needs a full http(s) URL")
            return False
        body["image_url"] = image_url
    else:
        assert image_base64 is not None
        body["image_base64"] = image_base64.strip()

    url = lemonslice_session_control_url(session_id)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": api_key,
                },
                json=body,
                timeout=30.0,
            )
    except httpx.HTTPError:
        # Transport / timeout — do not retry; update-image is not idempotent.
        logger.exception("LemonSlice update-image transport error")
        return False

    if response.is_success:
        return True
    logger.error(
        "LemonSlice update-image failed: %s %s",
        response.status_code,
        response.text,
    )
    return False


async def apply_image_and_notify(
    room: rtc.Room,
    *,
    lemonslice_session_id: str,
    image_url: str | None = None,
    image_base64: str | None = None,
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
    if not await lemonslice_control_update_image(
        lemonslice_session_id,
        image_url=image_url,
        image_base64=image_base64,
    ):
        return None
    if image_url:
        logger.info("LemonSlice image update accepted: %s", image_url[:80])
        await publish_agent_event(
            room,
            "image_accepted",
            {"image_url": image_url, "message": image_url},
        )
    else:
        nbytes = len(decode_image_base64_field(image_base64 or ""))
        logger.info("LemonSlice image update accepted: %s inline bytes", nbytes)
        await publish_agent_event(
            room,
            "image_accepted",
            {"image_bytes": nbytes, "message": f"{nbytes} bytes (image_base64)"},
        )
    return generation


async def run_nano_banana_edit(
    *,
    prompt: str,
    source_image_url: str | None = None,
    source_image_bytes: bytes | None = None,
) -> str | None:
    """
    Edit a source image with Fal Nano Banana 2 Lite.

    Provide ``source_image_url`` and/or ``source_image_bytes`` (bytes preferred).
    Returns a new public image URL or None.
    """
    if not (os.getenv("FAL_KEY") or "").strip():
        logger.error("FAL_KEY is not set")
        return None

    if source_image_bytes:
        jpeg_b64 = image_bytes_to_jpeg_base64(source_image_bytes)
        source = fal_client.encode(base64.b64decode(jpeg_b64), "image/jpeg")
    elif source_image_url and source_image_url.startswith(("http://", "https://")):
        source = source_image_url
    else:
        logger.error("Nano Banana edit needs source_image_url or source_image_bytes")
        return None

    fal_prompt = f"{prompt.strip()}\n\n{FAL_EDIT_PROMPT_APPEND}"
    try:
        result = await fal_client.subscribe_async(
            FAL_NANO_BANANA_EDIT_MODEL,
            arguments={
                "prompt": fal_prompt,
                "image_urls": [source],
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
