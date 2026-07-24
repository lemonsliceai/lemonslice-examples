"""Create Daily / LiveKit rooms and tokens for websocket egress."""

from __future__ import annotations

import os
import time
import uuid
from typing import Literal

import httpx
from fastapi import HTTPException
from livekit import api

DAILY_API_BASE_URL = "https://api.daily.co/v1"
EgressProvider = Literal["daily", "livekit"]


async def create_daily_room_and_tokens() -> tuple[str, str, str]:
    """
    Returns (room_url, agent_token, viewer_token).
    """
    api_key = os.getenv("DAILY_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "missing_daily_credentials",
                "message": "Missing DAILY_API_KEY",
            },
        )

    room_name = f"ls-ws-{uuid.uuid4().hex[:12]}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        room_resp = await client.post(
            f"{DAILY_API_BASE_URL}/rooms",
            headers=headers,
            json={
                "name": room_name,
                "properties": {
                    "exp": int(time.time()) + 60 * 60,
                    "eject_at_room_exp": True,
                },
            },
        )
        if room_resp.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Failed creating Daily room: {room_resp.text}",
            )
        room_payload = room_resp.json()
        room_url = room_payload.get("url")
        if not room_url:
            raise HTTPException(status_code=502, detail="Daily room response missing url")

        async def mint_token(*, is_owner: bool) -> str:
            token_resp = await client.post(
                f"{DAILY_API_BASE_URL}/meeting-tokens",
                headers=headers,
                json={
                    "properties": {
                        "room_name": room_name,
                        "is_owner": is_owner,
                        "enable_screenshare": False,
                    },
                },
            )
            if token_resp.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed creating Daily token: {token_resp.text}",
                )
            token = token_resp.json().get("token")
            if not token:
                raise HTTPException(status_code=502, detail="Daily token response missing token")
            return token

        agent_token = await mint_token(is_owner=True)
        viewer_token = await mint_token(is_owner=False)

    return room_url, agent_token, viewer_token


def create_livekit_tokens() -> tuple[str, str, str, str]:
    """
    Returns (livekit_url, room_name, agent_token, viewer_token).
    """
    livekit_url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    if not livekit_url or not api_key or not api_secret:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "missing_livekit_credentials",
                "message": "Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET",
            },
        )

    room_name = f"ls-ws-{uuid.uuid4().hex[:12]}"

    agent_token = (
        api.AccessToken(api_key, api_secret)
        .with_identity("lemonslice")
        .with_name("LemonSlice")
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
    return livekit_url, room_name, agent_token, viewer_token
