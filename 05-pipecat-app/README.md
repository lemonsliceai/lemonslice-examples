# pipecat-app

End-to-end example showing LemonSlice self-managed Pipecat integration with a Next.js frontend that joins the Daily room.

This keeps the same UI pattern used in `03-livekit-app-python` and `04-livekit-app-nodejs` (pre-join, ringing, in-call controls), but swaps LiveKit for Daily + Pipecat transport.

## Project layout

| Path | What |
| --- | --- |
| **Next.js app** (repo root) and `/api/session` | Frontend plus backend proxy endpoint |
| `agent/` | Python FastAPI service that runs Pipecat |

## Setup

1. Copy env file:

```bash
cp .env.example .env.local
```

2. Fill in:

- `LEMONSLICE_API_KEY`
- One of `LEMONSLICE_AGENT_ID` or `LEMONSLICE_AGENT_IMAGE_URL`
- `DAILY_API_KEY`
- `DEEPGRAM_API_KEY`
- `GROQ_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

3. Install dependencies:

```bash
npm install
cd agent
uv python install 3.12
uv sync --python 3.12
```

## Run locally

Run both frontend and Pipecat backend:

```bash
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

## Important: Pipecat from source

This example installs `pipecat-ai` from GitHub source (`main`) in `agent/pyproject.toml` so `on_avatar_connected` / `on_avatar_disconnected` are available.

## How it works

1. Frontend calls `POST /api/session`.
2. Next.js route creates a Daily room and meeting token using Daily REST API.
3. Next.js sends `daily_room_url` + `daily_token` to `agent` (`POST /session`).
4. Agent starts `LemonSliceTransport` with those Daily values in `LemonSliceNewSessionRequest`.
5. Next.js returns `{ room_url, token }`; frontend joins that room with Daily.
6. Frontend text composer calls `POST /api/message`, which queues a user text turn in Pipecat.
7. On hangup, frontend calls `DELETE /api/session`, which cancels the running Pipecat task.
