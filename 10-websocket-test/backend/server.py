"""
Local helper for the websocket Daily/LiveKit transport.

Creates the egress room (Daily or LiveKit) and starts a LemonSlice websocket
session with those credentials.
"""

from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.rooms import create_daily_room_and_tokens, create_livekit_tokens

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
load_dotenv(PROJECT_ROOT / ".env")

SESSIONS_API_URL = "https://lemonslice.com/api/liveai/sessions"
AGENT_IMAGE_PATH = PROJECT_ROOT / "assets" / "agent.jpg"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateSessionRequest(BaseModel):
    egress: Literal["daily", "livekit"] = Field(
        description="RTC egress provider for avatar A/V",
    )


def _load_agent_image_base64() -> str:
    if not AGENT_IMAGE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Missing agent image at {AGENT_IMAGE_PATH}",
        )
    return base64.b64encode(AGENT_IMAGE_PATH.read_bytes()).decode("ascii")


@app.post("/create-session")
async def create_session(body: CreateSessionRequest):
    api_key = os.getenv("LEMONSLICE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail={"code": "missing_api_key", "message": "Missing LEMONSLICE_API_KEY"},
        )

    try:
        agent_image_base64 = _load_agent_image_base64()
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read agent image: {exc}",
        ) from exc

    if body.egress == "daily":
        room_url, agent_token, viewer_token = await create_daily_room_and_tokens()
        transport_type = "websocket-daily"
        session_payload = {
            "transport_type": transport_type,
            "agent_image_base64": agent_image_base64,
            "daily_properties": {
                "daily_url": room_url,
                "daily_token": agent_token,
            },
        }
    else:
        livekit_url, livekit_room, agent_token, viewer_token = create_livekit_tokens()
        print(f"[create-session] LiveKit room: {livekit_room}", flush=True)
        transport_type = "websocket-livekit"
        session_payload = {
            "transport_type": transport_type,
            "agent_image_base64": agent_image_base64,
            "livekit_properties": {
                "livekit_url": livekit_url,
                "livekit_token": agent_token,
            },
        }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                SESSIONS_API_URL,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json",
                },
                json=session_payload,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach sessions API: {exc}",
            ) from exc

        if response.status_code >= 400:
            detail: object
            try:
                payload = response.json()
                detail = payload.get("detail") or payload.get("error") or payload
            except Exception:
                detail = response.text
            raise HTTPException(status_code=response.status_code, detail=detail)

        data = response.json()

    result = {
        "egress": body.egress,
        "session_id": data.get("session_id"),
        "websocket_address": data.get("websocket_address"),
        "control_url": data.get("control_url"),
    }
    if body.egress == "daily":
        result["room_url"] = room_url
        result["token"] = viewer_token
    else:
        result["livekit_url"] = livekit_url
        result["livekit_token"] = viewer_token
    return result
