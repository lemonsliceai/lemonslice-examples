"""LiveKit room naming and access tokens.

The avatar token is handed to LemonSlice so it can publish; the viewer token is
subscribe-only because the user's microphone travels over the bridge WebSocket
rather than through LiveKit.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from datetime import timedelta

from livekit import api

AVATAR_IDENTITY = "lemonslice"
TOKEN_TTL_SECONDS = 60 * 60


@dataclass(frozen=True)
class LiveKitRoom:
    url: str
    name: str
    avatar_token: str
    viewer_token: str


def create_livekit_room() -> LiveKitRoom:
    url = os.environ["LIVEKIT_URL"]
    api_key = os.environ["LIVEKIT_API_KEY"]
    api_secret = os.environ["LIVEKIT_API_SECRET"]
    room_name = f"11labs-avatar-{uuid.uuid4().hex[:12]}"

    avatar_token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(AVATAR_IDENTITY)
        .with_name("LemonSlice Avatar")
        .with_ttl(timedelta(seconds=TOKEN_TTL_SECONDS))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )
    viewer_token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(f"viewer-{uuid.uuid4().hex[:8]}")
        .with_name("Viewer")
        .with_ttl(timedelta(seconds=TOKEN_TTL_SECONDS))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=False,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )

    return LiveKitRoom(
        url=url,
        name=room_name,
        avatar_token=avatar_token,
        viewer_token=viewer_token,
    )
