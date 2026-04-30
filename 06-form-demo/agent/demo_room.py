"""Small helpers for demo state + LiveKit data channels (aligned with lemonslice examples)."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from livekit import rtc

logger = logging.getLogger("demo")

# Client subscribes with the same topic string.
DEMO_TOPIC = "demo"

DEFAULT_AVATAR_IDENTITY = "lemonslice-avatar-agent"


def register_avatar_disconnect_handler(
    room: rtc.Room,
    *,
    avatar_identity: str = DEFAULT_AVATAR_IDENTITY,
) -> None:
    """Log avatar lifecycle; optionally could disconnect room when avatar leaves."""

    def on_disconnected(participant: rtc.RemoteParticipant) -> None:
        if getattr(participant, "identity", None) != avatar_identity:
            return
        logger.info("LemonSlice avatar left")

    room.on("participant_disconnected", on_disconnected)


async def publish_json(room: rtc.Room, payload: dict[str, Any]) -> None:
    data = json.dumps(payload).encode("utf-8")
    await room.local_participant.publish_data(
        data,
        reliable=True,
        topic=DEMO_TOPIC,
        destination_identities=[],
    )


Stage = Literal["intro", "schedule", "done"]


@dataclass
class DemoState:
    stage: Stage = "intro"
    email: str | None = None
    selected_date: str | None = None  # YYYY-MM-DD
    selected_slot: str | None = None  # e.g. "1:00 pm"
    confirmed: bool = False
    ui_hint: str | None = None  # last non-voice action for the model

    def merge(self, patch: dict[str, Any]) -> None:
        for k, v in patch.items():
            if hasattr(self, k) and v is not None:
                setattr(self, k, v)

    def to_payload(self) -> dict[str, Any]:
        d = asdict(self)
        return {"type": "state", **d}

