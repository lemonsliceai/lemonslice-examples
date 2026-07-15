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
)
from livekit.plugins import lemonslice, noise_cancellation
from livekit.rtc import DataPacket

from lemonslice_control import (
    AGENT_AVATAR_READY_TOPIC,
    AGENT_IMAGE_EDIT_TOPIC,
    AGENT_SET_IMAGE_TOPIC,
    ImageChangeCompleteGate,
    apply_image_and_notify,
    publish_agent_event,
    register_image_change_complete_listener,
    run_nano_banana_edit,
)

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local")

logger = logging.getLogger("lemonslice")

# Public HTTPS images (LemonSlice fetches these server-side — localhost paths will not work).
_HERO = "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/public/hero_agents"

AGENT_IMAGE_URL = f"{_HERO}/jess2/base.png"

# Tool presets — keyed names match the education panel copy.
SCENE_IMAGES: dict[str, str] = {
    "outfit": f"{_HERO}/jess2/lemons.png",
    "outside": f"{_HERO}/jess2/alps.png",
    "sunglasses": f"{_HERO}/jess2/sunglasses.png",
}

AGENT_NAME = os.getenv("AGENT_NAME")
if not AGENT_NAME:
    raise RuntimeError("Missing required env var: AGENT_NAME")

ASSISTANT_INSTRUCTIONS = """
You are Jess, an AI avatar powered by LemonSlice.
You can change your appearance mid-call using tools when the conversation calls for it.

# Appearance tools (use when natural — do not announce the tool names)
- change_outfit: when the user wants a new outfit / clothing swap
- go_outside: when the user wants to go outdoors / change the setting
- add_sunglasses: when the user wants to put on accessories or sunglasses

After a tool succeeds (it waits until the new image is on video), briefly acknowledge
the change in one short sentence. Do not call tools back-to-back unless the user asks
for another change.

# Brevity
Three sentences or less.

# Safety
If the user gets inappropriate, steer back to acceptable topics.
""".strip()


class Assistant(Agent):
    def __init__(
        self,
        *,
        room: rtc.Room,
        lemonslice_session_id: str,
        current_image_url: list[str],
        image_ready: asyncio.Event,
        image_change_gate: ImageChangeCompleteGate,
    ) -> None:
        super().__init__(instructions=ASSISTANT_INSTRUCTIONS)
        self._room = room
        self._session_id = lemonslice_session_id
        self._current_image_url = current_image_url
        self._image_ready = image_ready
        self._image_change_gate = image_change_gate

    async def _swap_scene(self, scene_key: str, label: str) -> str:
        if not self._image_ready.is_set():
            return "Avatar is not ready for image updates yet — wait a moment and try again."
        image_url = SCENE_IMAGES[scene_key]
        generation = await apply_image_and_notify(
            self._room,
            lemonslice_session_id=self._session_id,
            image_url=image_url,
            image_change_gate=self._image_change_gate,
        )
        if generation is None:
            return f"Could not apply the {label} image via LemonSlice control update-image."
        # Hold the tool result (and therefore the spoken reply) until the avatar
        # has pushed the new frames — same signal the UI uses for its transition.
        saw_complete = await self._image_change_gate.wait(generation)
        if not saw_complete:
            logger.warning(
                "Timed out waiting for image_change_complete after %s swap", scene_key
            )
            return (
                f"The {label} image was sent but the video transition timed out. "
                "Do not claim the look definitely changed."
            )
        self._current_image_url[0] = image_url
        return (
            f"The avatar image has finished updating to the {label} look. "
            "Acknowledge the new appearance briefly."
        )

    @function_tool()
    async def change_outfit(self, context: RunContext) -> str:
        """Swap to a different outfit when the user wants a clothing / look change."""
        return await self._swap_scene("outfit", "outfit")

    @function_tool()
    async def go_outside(self, context: RunContext) -> str:
        """Move the scene outdoors when the user wants to go outside or change location."""
        return await self._swap_scene("outside", "outside")

    @function_tool()
    async def add_sunglasses(self, context: RunContext) -> str:
        """Add accessories (e.g. sunglasses / props) when the user asks for them."""
        return await self._swap_scene("sunglasses", "accessories")


server = AgentServer()


def _register_set_image_listener(
    room: rtc.Room,
    *,
    lemonslice_session_id: str,
    current_image_url: list[str],
    image_ready: asyncio.Event,
    image_change_gate: ImageChangeCompleteGate,
) -> None:
    """Client → agent: `{ \"type\": \"set_image\", \"image_url\": \"https://...\" }`."""

    def on_data(packet: DataPacket) -> None:
        if packet.topic != AGENT_SET_IMAGE_TOPIC:
            return
        asyncio.create_task(
            _handle_set_image(
                packet.data,
                room=room,
                lemonslice_session_id=lemonslice_session_id,
                current_image_url=current_image_url,
                image_ready=image_ready,
                image_change_gate=image_change_gate,
            )
        )

    room.on("data_received", on_data)


async def _handle_set_image(
    raw: bytes,
    *,
    room: rtc.Room,
    lemonslice_session_id: str,
    current_image_url: list[str],
    image_ready: asyncio.Event,
    image_change_gate: ImageChangeCompleteGate,
) -> None:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("agent/set_image: invalid JSON")
        return
    if not isinstance(data, dict) or data.get("type") != "set_image":
        return
    image_url = data.get("image_url")
    if not isinstance(image_url, str) or not image_url.strip():
        return
    if not image_ready.is_set():
        logger.warning("agent/set_image: avatar not ready yet")
        await publish_agent_event(
            room,
            "image_update_failed",
            {"message": "Avatar not ready for image updates yet."},
        )
        return
    generation = await apply_image_and_notify(
        room,
        lemonslice_session_id=lemonslice_session_id,
        image_url=image_url.strip(),
        image_change_gate=image_change_gate,
    )
    if generation is not None:
        current_image_url[0] = image_url.strip()
    else:
        await publish_agent_event(
            room,
            "image_update_failed",
            {"message": "LemonSlice rejected the image URL."},
        )


def _register_image_edit_listener(
    room: rtc.Room,
    *,
    lemonslice_session_id: str,
    current_image_url: list[str],
    image_ready: asyncio.Event,
    image_change_gate: ImageChangeCompleteGate,
    edit_task_box: list[asyncio.Task | None],
) -> None:
    """Client → agent: Nano Banana edit on agent/image_edit."""

    def on_data(packet: DataPacket) -> None:
        if packet.topic != AGENT_IMAGE_EDIT_TOPIC:
            return
        prev = edit_task_box[0]
        if prev is not None and not prev.done():
            prev.cancel()
        edit_task_box[0] = asyncio.create_task(
            _handle_image_edit(
                packet.data,
                room=room,
                lemonslice_session_id=lemonslice_session_id,
                current_image_url=current_image_url,
                image_ready=image_ready,
                image_change_gate=image_change_gate,
            )
        )

    room.on("data_received", on_data)


async def _handle_image_edit(
    raw: bytes,
    *,
    room: rtc.Room,
    lemonslice_session_id: str,
    current_image_url: list[str],
    image_ready: asyncio.Event,
    image_change_gate: ImageChangeCompleteGate,
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
    if isinstance(source, str) and source.strip().startswith(("http://", "https://")):
        base_url = source.strip()
    else:
        base_url = current_image_url[0]

    if not image_ready.is_set():
        await publish_agent_event(
            room,
            "image_update_failed",
            {"request_id": request_id, "message": "Avatar not ready yet."},
        )
        return

    logger.info("Nano Banana edit started request_id=%s prompt=%r", request_id, prompt[:80])
    new_url = await run_nano_banana_edit(prompt=prompt.strip(), source_image_url=base_url)
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

    generation = await apply_image_and_notify(
        room,
        lemonslice_session_id=lemonslice_session_id,
        image_url=new_url,
        image_change_gate=image_change_gate,
    )
    if generation is not None:
        current_image_url[0] = new_url
        logger.info("Nano Banana edit applied request_id=%s", request_id)
    else:
        await publish_agent_event(
            room,
            "image_update_failed",
            {
                "request_id": request_id,
                "message": "Could not apply the edited image to the avatar.",
            },
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
        agent_prompt="A person talking.",
    )

    session_id = await avatar.start(session, room=ctx.room)
    current_image_url = [AGENT_IMAGE_URL]
    image_ready = asyncio.Event()
    image_change_gate = ImageChangeCompleteGate()
    edit_task_box: list[asyncio.Task | None] = [None]

    register_image_change_complete_listener(ctx.room, image_change_gate)
    _register_set_image_listener(
        ctx.room,
        lemonslice_session_id=session_id,
        current_image_url=current_image_url,
        image_ready=image_ready,
        image_change_gate=image_change_gate,
    )
    _register_image_edit_listener(
        ctx.room,
        lemonslice_session_id=session_id,
        current_image_url=current_image_url,
        image_ready=image_ready,
        image_change_gate=image_change_gate,
        edit_task_box=edit_task_box,
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(
            room=ctx.room,
            lemonslice_session_id=session_id,
            current_image_url=current_image_url,
            image_ready=image_ready,
            image_change_gate=image_change_gate,
        ),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
            audio_output=False,
        ),
    )

    # Allow update-image once the avatar participant is in the room (control needs ACTIVE).
    # Frontend also gates UI on LiveKitAvatarReadyWatcher / bot_ready.
    async def _mark_ready_when_avatar_joins() -> None:
        identity = "lemonslice-avatar-agent"
        for p in ctx.room.remote_participants.values():
            if p.identity == identity:
                # Brief settle so LemonSlice marks the session ACTIVE.
                await asyncio.sleep(2.0)
                image_ready.set()
                logger.info("Image updates enabled (avatar present)")
                return

        ready = asyncio.Event()

        def on_connected(participant: rtc.RemoteParticipant) -> None:
            if participant.identity == identity:
                ready.set()

        ctx.room.on("participant_connected", on_connected)
        try:
            await asyncio.wait_for(ready.wait(), timeout=60)
            await asyncio.sleep(2.0)
            image_ready.set()
            logger.info("Image updates enabled (avatar joined)")
        except asyncio.TimeoutError:
            logger.warning("Avatar did not join; enabling image updates anyway")
            image_ready.set()

    asyncio.create_task(_mark_ready_when_avatar_joins())

    # Greet only after the client reports the avatar stream is ready
    # (LiveKitAvatarReadyWatcher → agent/avatar_ready).
    greeted = False

    def on_avatar_ready(packet: DataPacket) -> None:
        nonlocal greeted
        if packet.topic != AGENT_AVATAR_READY_TOPIC or greeted:
            return
        try:
            data = json.loads(packet.data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        if not isinstance(data, dict) or data.get("type") != "avatar_ready":
            return
        greeted = True
        logger.info("Client avatar_ready; generating greeting")

        async def _greet() -> None:
            await session.generate_reply(
                instructions=(
                    "Greet the user briefly. Mention you can change outfits, go outside, "
                    "or add accessories if they ask — or they can use the panel on the right."
                )
            )

        asyncio.create_task(_greet())

    ctx.room.on("data_received", on_avatar_ready)


if __name__ == "__main__":
    agents.cli.run_app(server)
