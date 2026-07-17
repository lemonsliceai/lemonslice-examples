import asyncio
import json
import logging
from livekit import rtc

logger = logging.getLogger("lemonslice")

DEFAULT_LEMONSLICE_AVATAR_IDENTITY = "lemonslice-avatar-agent"
# Clients should listen on RoomEvent.DataReceived/data_received for this topic.
ROOM_MESSAGE_TOPIC = "lemonslice/message"


def register_lemonslice_avatar_room_handlers(
    room: rtc.Room,
    *,
    avatar_identity: str = DEFAULT_LEMONSLICE_AVATAR_IDENTITY,
    disconnect_room_on_avatar_leave: bool = True,
) -> None:
    """
    Register LiveKit room callbacks for the LemonSlice avatar participant.

    Logs when the avatar joins or leaves. If ``disconnect_room_on_avatar_leave`` is True,
    leave the room.
    """

    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        if getattr(participant, "identity", None) != avatar_identity:
            return
        logger.info("LemonSlice Avatar joined")

    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        if getattr(participant, "identity", None) != avatar_identity:
            return
        logger.info("LemonSlice Avatar left")
        if not disconnect_room_on_avatar_leave:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("No running event loop; cannot schedule room.disconnect()")
            return
        loop.create_task(room.disconnect())

    room.on("participant_connected", on_participant_connected)
    room.on("participant_disconnected", on_participant_disconnected)


async def publish_room_message(room: rtc.Room, msg_type: str, message: str) -> None:
    """
    Broadcast a small JSON notice to all participants in the room via LiveKit data channels.
    """
    try:
        payload = json.dumps(
            {
                "type": msg_type,
                "message": message,
            }
        ).encode("utf-8")
        await room.local_participant.publish_data(
            payload,
            reliable=True,
            topic=ROOM_MESSAGE_TOPIC,
            destination_identities=[],
        )
    except Exception:
        logger.exception("Failed to publish message to room")
