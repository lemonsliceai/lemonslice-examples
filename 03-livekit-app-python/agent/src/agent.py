"""
LiveKit Agents worker: LiveKit Inference (LLM + STT + TTS) + LemonSlice avatar.

Loads environment from the repository root `.env` / `.env.local` (same as Next.js).
From repo root: `npm run dev:agent` or `npm run dev:all`.
"""

from __future__ import annotations

import os
import pathlib

from dotenv import load_dotenv

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, TurnHandlingOptions, inference, room_io, utils
from livekit.plugins import lemonslice, noise_cancellation

# Repo root = parent of `agent/` (same `.env.local` as Next.js)
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env.local")
load_dotenv(_REPO_ROOT / ".env")

# Reference image for the LemonSlice avatar. Must be a full HTTP(S) URL that is
# publicly reachable on the internet — LemonSlice's servers fetch it.
#
# A site path (e.g. `/avatar.png`), a local file path, or `localhost` URLs their
# infra cannot reach will not work.
#
# Host the image on your app, blob storage, a CDN, etc.
AGENT_IMAGE_URL = "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/inf2-image-uploads/resized-image-MsYROR20dQfBG4KOLMe0pR7t34TSB0.jpg"
AGENT_NAME = os.getenv("AGENT_NAME")
if not AGENT_NAME:
    raise RuntimeError("Missing required env var: AGENT_NAME")

ASSISTANT_INSTRUCTIONS = """
You are Jess, an AI avatar powered by LemonSlice.
You are powered by a cutting-edge diffusion transformer video model. The user is speaking to you via a browser.

# Looks.
You appear as a friendly young woman with black hair.

# Safety,
if the user gets inappropriate, steer the conversation back to acceptable topics.

Critical rule reminder. Three sentences or less.
""".strip()


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=ASSISTANT_INSTRUCTIONS)


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def lemonslice_agent(ctx: agents.JobContext) -> None:
    session = AgentSession(
        llm="google/gemma-4-31b-it",
        stt=inference.STT(model="deepgram/nova-3", language="en"),
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        turn_handling=TurnHandlingOptions(
            interruption={"resume_false_interruption": True},
        ),
    )

    await ctx.connect()

    avatar = lemonslice.AvatarSession(
        agent_image_url=AGENT_IMAGE_URL,
        agent_prompt="A person talking.",
    )

    await avatar.start(session, room=ctx.room)

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
            audio_output=False,
        ),
    )

    # Wait for the LemonSlice avatar (AGENT participant) before the first reply.
    await utils.wait_for_agent(ctx.room)
    await session.generate_reply()


if __name__ == "__main__":
    agents.cli.run_app(server)
