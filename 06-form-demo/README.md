# LemonSlice Form Demo

Rudimentary demo of a voice + chat SDR experience:

- `frontend`: Next.js app (React UI + `/api/token` LiveKit token route)
- `agent`: Python LiveKit Agent that runs the SDR logic and drives sidebar state

## What this demo does

This app simulates an AI SDR ("Alex") on the right side of a fake Acme Education landing page.

In a typical flow:

1. User joins a LiveKit room from the browser.
2. Agent greets and asks for work email.
3. Agent reveals calendar after email is saved.
4. User picks a slot in the sidebar.
5. Agent confirms booking and shows a confirmation modal.

The sidebar state and timing metrics move over LiveKit data topics.

## Repo layout

- `frontend/app/page.tsx` → `src/App.tsx`: root layout (`Landing` + `AgentSidebar` + `PipelineHud`)
- `frontend/app/api/token/route.ts`: mints LiveKit access tokens (server-only secrets)
- `frontend/src/useLiveKitRoom.ts`: LiveKit room lifecycle, transcript handling, data events
- `frontend/src/components/AgentSidebar.tsx`: avatar video, transcript, schedule UI, confirm flow
- `agent/agent.py`: voice agent instructions, tools, room event handling, avatar session startup
- `agent/demo_room.py`: typed demo state + data publish helpers

## Prerequisites

- Node.js 18+ (for `frontend`)
- [uv](https://docs.astral.sh/uv/) (for `agent` Python env; installs a compatible Python if needed)
- A LiveKit project (Cloud or self-hosted)
- A LemonSlice API key (for avatar session)

## Environment

Copy and edit env values:

```bash
cp .env.example .env
```

The Next.js app loads the repo-root `.env` via `next.config.ts` so LiveKit secrets stay in one file.

Required values:

- `LIVEKIT_URL` (example: `wss://<project>.livekit.cloud`)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LEMONSLICE_API_KEY`

Optional values:

- `AVATAR_IMAGE_URL` (override default portrait)
- `NEXT_PUBLIC_TOKEN_URL` (only if the browser UI is on a different origin than the API; otherwise `/api/token` on the same host is used)

## Install

Install JS deps:

```bash
cd frontend && npm install
```

Install Python deps (managed by uv; `.venv` is gitignored):

```bash
cd agent
uv sync
```

## Run locally

Run two processes in separate terminals.

1) Voice agent

```bash
cd agent
uv run python agent.py dev
```

2) Frontend (Next.js dev server — includes `GET /api/token`)

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Deploy

Deploy **frontend** and **agent** separately (same idea as [lemonslice-examples `03-livekit-app-python`](https://github.com/lemonsliceai/lemonslice-examples/tree/main/03-livekit-app-python)).

- **Frontend:** set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_AGENT_NAME` on the host (must match the worker; default name is `form-demo`). Keep the API secret server-side only.
- **Agent (LiveKit Cloud):** install the [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli.md), `cd agent`, then run `lk agent create` once (writes local `Dockerfile` / `livekit.toml`, gitignored) with secrets mirroring `.env` (`LIVEKIT_*`, `LEMONSLICE_API_KEY`, same `LIVEKIT_AGENT_NAME`). Ship updates with `lk agent deploy` (or `lk agent deploy ./agent` from repo root).

## How the pieces connect

- Browser requests token from `GET /api/token` on the Next.js server (same origin in dev).
- Server returns `{ token, url, roomName, identity }`.
- Browser joins LiveKit room and enables microphone.
- Agent joins same room, starts LemonSlice avatar session, and greets.
- Sidebar UI events (`slot_selected`, `confirm_clicked`) are sent over LiveKit data (`demo` topic).
- Agent tool/state updates are published back on `demo` and rendered in UI.

## Notes

- This is intentionally minimal and demo-oriented (not production hardened).
- Calendar availability is static demo data in `frontend/src/data/availability.ts`.
- Pipeline HUD is a rough visual for STT/LLM/TTS/video timings.
