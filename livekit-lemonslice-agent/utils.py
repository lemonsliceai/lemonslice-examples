import asyncio
import json
import logging
import os
import httpx
from livekit import rtc

logger = logging.getLogger("lemonslice")

DEFAULT_LEMONSLICE_AVATAR_IDENTITY = "lemonslice-avatar-agent"
FIVE_MINS = 60 * 5
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
        logger.info("LemonSLice Avatar joined")

    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        if getattr(participant, "identity", None) != avatar_identity:
            return
        logger.info("LemonSLice Avatar left")
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


async def wait_for_avatar_ready(session_id: str, max_attempts: int = FIVE_MINS) -> bool:
    """
    Poll the LemonSlice API to wait until the avatar session is active.

    Args:
        session_id: The LemonSlice session ID
        max_attempts: Maximum number of polling attempts (default: 5 minutes)

    Returns:
        True if avatar became active, False otherwise
    """
    logger.info(f"Polling avatar status for session {session_id}")

    async with httpx.AsyncClient() as client:
        for _ in range(max_attempts):
            try:
                response = await client.get(
                    f"http://localhost:3000/api/liveai/sessions/{session_id}",
                    headers={"X-API-Key": os.getenv("LEMONSLICE_API_KEY")},
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()
                status = data.get("session_status", "UNKNOWN")

                logger.info(f"Avatar status: {status}")

                if status == "ACTIVE":
                    logger.info("Avatar is active and ready")
                    return True
                elif status in ["COMPLETED", "TIMED_OUT", "FAILED"]:
                    logger.warning(f"Avatar session ended with status: {status}")
                    return False
                elif status == "QUEUED":
                    # Still queued, continue polling
                    await asyncio.sleep(1)
                else:
                    logger.warning(f"Unknown avatar status: {status}")
                    await asyncio.sleep(1)

            except httpx.HTTPError as e:
                logger.error(f"Error checking avatar status: {e}", exc_info=True)
                await asyncio.sleep(1)

        logger.warning("Avatar status check timed out")
        return False
