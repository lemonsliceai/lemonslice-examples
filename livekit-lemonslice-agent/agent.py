import logging
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import noise_cancellation, lemonslice
from utils import publish_room_message, register_lemonslice_avatar_room_handlers, wait_for_avatar_ready

load_dotenv()
logger = logging.getLogger("lemonslice")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful assistant.
            You eagerly assist users with their questions by providing information from your extensive knowledge.
            Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor.""",
        )


server = AgentServer()


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

    # Wait until the avatar has joined the room and is ready
    avatar_ready = await wait_for_avatar_ready(session_id)
    if not avatar_ready:
        logger.warning("Avatar failed to become active, exiting")
        await publish_room_message(
            ctx.room,
            msg_type="startup_failure",
            message="Avatar failed to become active",
        )
        return

    await session.generate_reply(instructions="Greet the user and offer your assistance.")


if __name__ == "__main__":
    agents.cli.run_app(server)
