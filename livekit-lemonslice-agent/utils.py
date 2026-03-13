import asyncio
import os
import httpx
import logging

logger = logging.getLogger("lemonslice")

FIVE_MINS = 60 * 5


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
