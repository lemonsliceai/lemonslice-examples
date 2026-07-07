"""
LiveKit Agents worker: Groq LLM + ElevenLabs TTS + LemonSlice avatar.

Loads environment from the repository root `.env` / `.env.local` (same as Next.js).
From repo root: `npm run dev:agent` or `npm run dev:all`.
"""

from __future__ import annotations

import os
import pathlib

from dotenv import load_dotenv

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, TurnHandlingOptions, inference, room_io
from livekit.plugins import elevenlabs, groq, lemonslice, noise_cancellation

# Repo root = parent of `agent/` (same `.env.local` as Next.js)
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local")

LIVEKIT_AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "").strip()
AGENT_IMAGE_URL = os.getenv("AGENT_IMAGE_URL", "").strip()
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
if not LIVEKIT_AGENT_NAME:
    raise RuntimeError("Missing required env var: LIVEKIT_AGENT_NAME")
if not AGENT_IMAGE_URL:
    raise RuntimeError("Missing required env var: AGENT_IMAGE_URL")
if not ELEVENLABS_VOICE_ID:
    raise RuntimeError("Missing required env var: ELEVENLABS_VOICE_ID")

ASSISTANT_INSTRUCTIONS = """
You are Jess, an AI avatar powered by LemonSlice.
You are powered by a cutting-edge pipeline of STT, LLM, TTS, and a diffusion transformer video model for the avatar. The user is speaking to you via a browser.

# Brevity.
# Looks.
You appear as a friendly young woman with black hair.

# Tech. The avatar model is a proprietary diffusion transformer video model that the LemonSlice team trained. The voice is powered by ElevenLabs. The text comes from an LLM.

# Safety,
if the user gets inappropriate, steer the conversation back to acceptable topics.

Critical rule reminder. Three sentences or less.
""".strip()


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=ASSISTANT_INSTRUCTIONS)


server = AgentServer()


@server.rtc_session(agent_name=LIVEKIT_AGENT_NAME)
async def lemonslice_agent(ctx: agents.JobContext) -> None:
    await ctx.connect()

    session = AgentSession(
        stt=inference.STT(
            model="deepgram/nova-2",
            language="en",
            extra_kwargs={"interim_results": False},
        ),
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=elevenlabs.TTS(voice_id=ELEVENLABS_VOICE_ID, model="eleven_flash_v2_5"),
        turn_handling=TurnHandlingOptions(
            interruption={"resume_false_interruption": False},
        ),
    )

    avatar = lemonslice.AvatarSession(
        agent_image_url=AGENT_IMAGE_URL,
        agent_prompt="A person talking.",
        aspect_ratio="2x3",
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

    await session.generate_reply()


if __name__ == "__main__":
    agents.cli.run_app(server)
