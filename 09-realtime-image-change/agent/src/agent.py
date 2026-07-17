"""
LiveKit Agents worker: LiveKit Inference (LLM + STT + TTS) + LemonSlice avatar
with realtime image updates via the Control session API (update-image).

Loads environment from the repository root `.env` / `.env.local` (same as Next.js).
From repo root: `npm run dev:agent` or `npm run dev:all`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import pathlib
from collections.abc import Coroutine
from typing import Any

from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    RunContext,
    TurnHandlingOptions,
    function_tool,
    inference,
    room_io,
    utils,
)
from livekit.plugins import lemonslice, noise_cancellation
from livekit.rtc import DataPacket

from lemonslice_control import (
    AGENT_IMAGE_EDIT_TOPIC,
    AGENT_SET_IMAGE_TOPIC,
    ImageChangeCompleteGate,
    apply_image_and_notify,
    decode_image_base64_field,
    image_bytes_to_jpeg_base64,
    load_local_image_base64,
    publish_agent_event,
    register_image_change_complete_listener,
    run_nano_banana_edit,
)

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_ASSETS_DIR = pathlib.Path(__file__).resolve().parents[1] / "assets"
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local")

logger = logging.getLogger("lemonslice")

# Public HTTPS image for session start (LiveKit LemonSlice plugin requires a URL).
_HERO = "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/public/hero_agents"
AGENT_IMAGE_URL = f"{_HERO}/jess2/base.png"

# Local presets for tool-driven update-image (sent as image_base64, not URLs).
AGENT_IMAGE_PATH = _ASSETS_DIR / "base.jpg"
SCENE_IMAGES: dict[str, pathlib.Path] = {
    "office": _ASSETS_DIR / "office.jpg",
    "outside": _ASSETS_DIR / "outside.jpg",
    "sunglasses": _ASSETS_DIR / "sunglasses.jpg",
}

AGENT_NAME = os.getenv("AGENT_NAME")
if not AGENT_NAME:
    raise RuntimeError("Missing required env var: AGENT_NAME")

ASSISTANT_INSTRUCTIONS = """
You are Jess, an AI avatar powered by LemonSlice.
You can change your appearance mid-call using tools when the conversation calls for it.

# Appearance tools (use when natural — do not announce the tool names)
- go_to_work: when the user wants an office / work setting, or to go to work
- go_outside: when the user wants to go outdoors, into the mountains, skiing, or a winter setting
- add_sunglasses: when the user wants sunglasses / accessories look
- reset_appearance: when the user wants to reset, go back, or return to the original /
  starting look

# Appearance changes do NOT stack
Each tool replaces the entire avatar image with a single preset. Calling another
appearance tool swaps to that preset — it does not layer on top of the previous one
(e.g. sunglasses after go_to_work is just the sunglasses look, not both). There is no
combined look via tools. To return to the beginning, use reset_appearance.

After a tool succeeds, briefly acknowledge the change in one short sentence. Make it fun and add some character.
Do not call tools back-to-back unless the user asks for another change.

# Brevity
Three sentences or less.

""".strip()


class CallState:
    """Mutable per-call state shared by the agent and data listeners."""

    def __init__(
        self,
        *,
        session_id: str,
        image_url: str | None,
        image_bytes: bytes | None,
    ) -> None:
        self.session_id = session_id
        self.image_url = image_url
        self.image_bytes = image_bytes
        self.image_ready = asyncio.Event()
        self.image_change_gate = ImageChangeCompleteGate()
        self.edit_task: asyncio.Task[Any] | None = None
        self._bg_tasks: set[asyncio.Task[Any]] = set()

    def spawn(self, coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
        """Keep a strong ref so fire-and-forget tasks are not GC'd mid-flight."""
        task = asyncio.create_task(coro)
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)
        return task


class Assistant(Agent):
    def __init__(
        self,
        *,
        room: rtc.Room,
        state: CallState,
    ) -> None:
        super().__init__(instructions=ASSISTANT_INSTRUCTIONS)
        self._room = room
        self._state = state

    async def _apply_local_image(
        self, path: pathlib.Path, label: str, *, tool_name: str
    ) -> str:
        state = self._state
        await publish_agent_event(
            self._room,
            "tool_call",
            {"message": tool_name},
        )
        if not state.image_ready.is_set():
            return "Avatar is not ready for image updates yet — wait a moment and try again."
        try:
            image_base64 = load_local_image_base64(path)
            image_bytes = decode_image_base64_field(image_base64)
        except Exception:
            logger.exception("Failed to load local preset %s", path)
            return f"Could not load the local {label} image preset."

        generation = await apply_image_and_notify(
            self._room,
            lemonslice_session_id=state.session_id,
            image_base64=image_base64,
            image_change_gate=state.image_change_gate,
        )
        if generation is None:
            return f"Could not apply the {label} image via LemonSlice control update-image."
        outcome = await state.image_change_gate.wait(generation)
        if outcome != "complete":
            logger.warning(
                "Image change %s after %s update", outcome or "timeout", label
            )
            return (
                f"The {label} image was sent but the video transition did not complete. "
                "Do not claim the look definitely changed."
            )
        state.image_url = None
        state.image_bytes = image_bytes
        return (
            f"The avatar image has finished updating to the {label} look. "
            "Acknowledge the new appearance briefly."
        )

    async def _swap_scene(self, scene_key: str, label: str, *, tool_name: str) -> str:
        return await self._apply_local_image(
            SCENE_IMAGES[scene_key], label, tool_name=tool_name
        )

    @function_tool()
    async def go_to_work(self, context: RunContext) -> str:
        """Go to an office / work setting when the user asks to go to work or change to a professional look."""
        return await self._swap_scene("office", "office", tool_name="go_to_work")

    @function_tool()
    async def go_outside(self, context: RunContext) -> str:
        """Go outdoors to a mountains / skiing setting when the user asks to go outside, ski, or change to a winter mountain look."""
        return await self._swap_scene(
            "outside", "outside / skiing", tool_name="go_outside"
        )

    @function_tool()
    async def add_sunglasses(self, context: RunContext) -> str:
        """Replace the full appearance with the sunglasses preset (does not stack on the current look)."""
        return await self._swap_scene(
            "sunglasses", "accessories", tool_name="add_sunglasses"
        )

    @function_tool()
    async def reset_appearance(self, context: RunContext) -> str:
        """Reset to the original starting look when the user asks to reset or go back."""
        return await self._apply_local_image(
            AGENT_IMAGE_PATH, "original", tool_name="reset_appearance"
        )


server = AgentServer()


async def speak_after_image_complete(session: AgentSession) -> None:
    """Panel-driven updates: one acknowledgment after image_change_complete."""
    await session.generate_reply(
        instructions=(
            "The avatar's appearance just finished updating on video. "
            "Acknowledge the new look briefly in one short sentence. Do not call any tools."
        ),
        tool_choice="none",
    )


def _register_set_image_listener(
    room: rtc.Room,
    *,
    state: CallState,
    session: AgentSession,
) -> None:
    """Client → agent: set_image with image_url and/or image_base64."""

    def on_data(packet: DataPacket) -> None:
        if packet.topic != AGENT_SET_IMAGE_TOPIC:
            return
        state.spawn(
            _handle_set_image(
                packet.data,
                room=room,
                state=state,
                session=session,
            )
        )

    room.on("data_received", on_data)


async def _handle_set_image(
    raw: bytes,
    *,
    room: rtc.Room,
    state: CallState,
    session: AgentSession,
) -> None:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("agent/set_image: invalid JSON")
        return
    if not isinstance(data, dict) or data.get("type") != "set_image":
        return

    image_url = data.get("image_url")
    image_base64 = data.get("image_base64")
    has_url = isinstance(image_url, str) and bool(image_url.strip())
    has_b64 = isinstance(image_base64, str) and bool(image_base64.strip())
    if has_url == has_b64:
        await publish_agent_event(
            room,
            "image_update_failed",
            {"message": "Provide exactly one of image_url or image_base64."},
        )
        return

    if not state.image_ready.is_set():
        logger.warning("agent/set_image: avatar not ready yet")
        await publish_agent_event(
            room,
            "image_update_failed",
            {"message": "Avatar not ready for image updates yet."},
        )
        return

    applied_url: str | None = None
    applied_bytes: bytes | None = None
    if has_b64:
        try:
            raw_b64 = image_base64.strip()
            if raw_b64.startswith("data:"):
                _, _, raw_b64 = raw_b64.partition(",")
            applied_bytes = decode_image_base64_field(raw_b64)
        except Exception:
            logger.exception("agent/set_image: invalid image_base64")
            await publish_agent_event(
                room,
                "image_update_failed",
                {"message": "Invalid image upload."},
            )
            return
        generation = await apply_image_and_notify(
            room,
            lemonslice_session_id=state.session_id,
            image_base64=raw_b64,
            image_change_gate=state.image_change_gate,
        )
        fail_message = "LemonSlice rejected the uploaded image."
    else:
        applied_url = image_url.strip()
        generation = await apply_image_and_notify(
            room,
            lemonslice_session_id=state.session_id,
            image_url=applied_url,
            image_change_gate=state.image_change_gate,
        )
        fail_message = "LemonSlice rejected the image URL."

    if generation is None:
        await publish_agent_event(
            room,
            "image_update_failed",
            {"message": fail_message},
        )
        return

    outcome = await state.image_change_gate.wait(generation)
    if outcome == "complete":
        state.image_url = applied_url
        state.image_bytes = applied_bytes
        await speak_after_image_complete(session)
    else:
        logger.warning(
            "Image change %s after set_image", outcome or "timeout"
        )


def _register_image_edit_listener(
    room: rtc.Room,
    *,
    state: CallState,
    session: AgentSession,
) -> None:
    """Client → agent: Nano Banana edit on agent/image_edit."""

    def on_data(packet: DataPacket) -> None:
        if packet.topic != AGENT_IMAGE_EDIT_TOPIC:
            return
        prev = state.edit_task
        if prev is not None and not prev.done():
            prev.cancel()
        state.edit_task = state.spawn(
            _handle_image_edit(
                packet.data,
                room=room,
                state=state,
                session=session,
            )
        )

    room.on("data_received", on_data)


async def _handle_image_edit(
    raw: bytes,
    *,
    room: rtc.Room,
    state: CallState,
    session: AgentSession,
) -> None:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("agent/image_edit: invalid JSON")
        return
    if not isinstance(data, dict) or data.get("type") != "image_edit":
        return

    request_id = data.get("request_id")
    if not isinstance(request_id, str) or not request_id.strip():
        return
    request_id = request_id.strip()

    prompt = data.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        await publish_agent_event(
            room,
            "image_update_failed",
            {"request_id": request_id, "message": "Invalid or empty prompt."},
        )
        return

    source = data.get("source_image_url")
    source_url: str | None = None
    source_bytes: bytes | None = None
    if isinstance(source, str) and source.strip().startswith(("http://", "https://")):
        source_url = source.strip()
    elif state.image_bytes is not None:
        source_bytes = state.image_bytes
    elif state.image_url:
        source_url = state.image_url
    else:
        # Fall back to the local base preset.
        source_bytes = AGENT_IMAGE_PATH.read_bytes()

    if not state.image_ready.is_set():
        await publish_agent_event(
            room,
            "image_update_failed",
            {"request_id": request_id, "message": "Avatar not ready yet."},
        )
        return

    logger.info("Nano Banana edit started request_id=%s prompt=%r", request_id, prompt[:80])
    await publish_agent_event(
        room,
        "fal_edit_started",
        {"request_id": request_id, "message": prompt.strip()[:120]},
    )
    new_url = await run_nano_banana_edit(
        prompt=prompt.strip(),
        source_image_url=source_url,
        source_image_bytes=source_bytes,
    )
    if not new_url:
        await publish_agent_event(
            room,
            "image_update_failed",
            {
                "request_id": request_id,
                "message": "Image edit failed. Check FAL_KEY and try again.",
            },
        )
        return

    await publish_agent_event(
        room,
        "fal_edit_complete",
        {"request_id": request_id, "image_url": new_url, "message": new_url},
    )

    # Download + resize the Fal result, then apply via image_base64 for a consistent size.
    try:
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.get(new_url, timeout=30.0)
            resp.raise_for_status()
            normalized_b64 = image_bytes_to_jpeg_base64(resp.content)
            applied_bytes = decode_image_base64_field(normalized_b64)
    except Exception:
        logger.exception("Failed to normalize edited image; falling back to URL")
        generation = await apply_image_and_notify(
            room,
            lemonslice_session_id=state.session_id,
            image_url=new_url,
            image_change_gate=state.image_change_gate,
        )
        if generation is None:
            await publish_agent_event(
                room,
                "image_update_failed",
                {
                    "request_id": request_id,
                    "message": "Could not apply the edited image to the avatar.",
                },
            )
            return
        pending_url, pending_bytes = new_url, None
    else:
        generation = await apply_image_and_notify(
            room,
            lemonslice_session_id=state.session_id,
            image_base64=normalized_b64,
            image_change_gate=state.image_change_gate,
        )
        if generation is None:
            await publish_agent_event(
                room,
                "image_update_failed",
                {
                    "request_id": request_id,
                    "message": "Could not apply the edited image to the avatar.",
                },
            )
            return
        pending_url, pending_bytes = new_url, applied_bytes

    logger.info("Nano Banana edit applied request_id=%s", request_id)
    outcome = await state.image_change_gate.wait(generation)
    if outcome == "complete":
        state.image_url = pending_url
        state.image_bytes = pending_bytes
        await speak_after_image_complete(session)
    else:
        logger.warning(
            "Image change %s after edit request_id=%s",
            outcome or "timeout",
            request_id,
        )


@server.rtc_session(agent_name=AGENT_NAME)
async def lemonslice_agent(ctx: agents.JobContext) -> None:
    session = AgentSession(
        llm=inference.LLM(model="openai/gpt-4o-mini"),
        stt=inference.STT(model="deepgram/nova-3", language="en"),
        tts=inference.TTS(
            model="elevenlabs/eleven_turbo_v2_5",
            voice="cgSgspJ2msm6clMCkdW9",
            language="en",
        ),
        turn_handling=TurnHandlingOptions(
            interruption={"resume_false_interruption": True},
        ),
    )

    await ctx.connect()

    avatar = lemonslice.AvatarSession(
        agent_image_url=AGENT_IMAGE_URL,
    )

    session_id = await avatar.start(session, room=ctx.room)
    state = CallState(
        session_id=session_id,
        image_url=AGENT_IMAGE_URL,
        image_bytes=AGENT_IMAGE_PATH.read_bytes() if AGENT_IMAGE_PATH.exists() else None,
    )

    register_image_change_complete_listener(ctx.room, state.image_change_gate)
    _register_set_image_listener(ctx.room, state=state, session=session)
    _register_image_edit_listener(ctx.room, state=state, session=session)

    await session.start(
        room=ctx.room,
        agent=Assistant(room=ctx.room, state=state),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
            audio_output=False,
        ),
    )

    # Wait for the LemonSlice avatar (AGENT participant) before updates / first reply.
    await utils.wait_for_agent(ctx.room)
    state.image_ready.set()
    logger.info("Avatar joined; image updates enabled")

    await session.generate_reply(
        instructions=(
            "Greet the user briefly and let them know you can change apperance (suggest one of the tool call options)"
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
