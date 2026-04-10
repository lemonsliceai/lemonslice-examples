import os
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

LEMON_SLICE_CREATE_ROOM_ENDPOINT = "https://lemonslice.com/api/rooms"

# Load environment variables
load_dotenv()

app = FastAPI()

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/create-room")
async def create_room():
    agent_id = os.getenv("AGENT_ID")
    api_key = os.getenv("API_KEY")

    if not agent_id or not api_key:
        raise HTTPException(status_code=500, detail="Missing environment variables")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                LEMON_SLICE_CREATE_ROOM_ENDPOINT,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json",
                },
                json={"agent_id": agent_id},
            )
            print("JBP: response", response)
            response.raise_for_status()
            data = response.json()
            return {"room_url": data["room_url"]}

        except httpx.HTTPError:
            raise HTTPException(status_code=500, detail="Failed to create room")
