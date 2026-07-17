import logging
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentServer, AgentSession, Agent, room_io, utils
from livekit.plugins import noise_cancellation, lemonslice
from utils import register_lemonslice_avatar_room_handlers

load_dotenv()
logger = logging.getLogger("lemonslice")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful assistant. Your answers will be spoken out loud. Do not use emojis, markdown, or any formatting outside of normal punctuation.""",
        )


server = AgentServer()


# optionally, add 'agent_name="my_agent"' to the rtc_session decorator. this allows for explicit dispatching in the playground.
@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    # Register to Livekit room callbacks
    register_lemonslice_avatar_room_handlers(ctx.room)

    session = AgentSession(
        stt="deepgram/nova-2",
        llm="openai/gpt-4o-mini",
        tts="elevenlabs/eleven_flash_v2_5",
        resume_false_interruption=False,
    )

    avatar = lemonslice.AvatarSession(
        agent_image_url="https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/inf2-image-uploads/image_9d0f6-WhaKqLKTzfVHlfe5jXzHE8Rpi9peF4.jpg",
        agent_prompt="a person talking.",
    )

    # Start the avatar and wait for it to join
    session_id = await avatar.start(session, room=ctx.room)

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(noise_cancellation=noise_cancellation.BVC()),
        ),
    )

    # Wait for the LemonSlice avatar (AGENT participant) before the first reply.
    await utils.wait_for_agent(ctx.room)
    await session.generate_reply()

if __name__ == "__main__":
    agents.cli.run_app(server)
