import json
import logging
import os

from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    cli,
    inference,
    utils,
)
from livekit.plugins import elevenlabs, groq, lemonslice

logger = logging.getLogger("zoom-avatar")
logger.setLevel(logging.INFO)

load_dotenv()

AGENT_NAME = "zoom-bot"

server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext):
    await ctx.connect()

    voice_id = os.getenv("ELEVENLABS_VOICE_ID")
    if voice_id is None:
        raise ValueError("ELEVENLABS_VOICE_ID must be set")

    lemonslice_image_url = os.getenv("LEMONSLICE_IMAGE_URL")
    if lemonslice_image_url is None:
        raise ValueError("LEMONSLICE_IMAGE_URL must be set")

    meta = json.loads(ctx.job.metadata) if ctx.job.metadata else {}
    meeting_url = meta.get("meeting_url")
    if not meeting_url:
        raise ValueError("meeting_url must be provided in job metadata")

    session = AgentSession(
        stt=inference.STT(
            model="deepgram/nova-2",
            language="en",
            extra_kwargs={"interim_results": False},
        ),
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=elevenlabs.TTS(voice_id=voice_id, model="eleven_flash_v2_5"),
        turn_handling=TurnHandlingOptions(
            interruption={
                "resume_false_interruption": False,
            },
        ),
    )
    avatar = lemonslice.AvatarSession(
        agent_image_url=lemonslice_image_url,
    )
    await avatar.start(session, room=ctx.room)

    await avatar.join_meeting(
        meeting_url,
        bot_name=meta.get("bot_name") or "My Bot",
        listen_to_meeting_chat=meta.get("listen_to_meeting_chat", True),
    )
    room_options = avatar.room_options()

    agent = Agent(
        instructions="You are a helpful assistant in a video meeting. Keep responses concise and natural for spoken conversation.",
    )

    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_options,
    )

    # Wait for the LemonSlice avatar (AGENT participant) before the first reply.
    await utils.wait_for_agent(ctx.room)
    session.generate_reply(instructions="Introduce yourself and offer to help.")


if __name__ == "__main__":
    cli.run_app(server)
