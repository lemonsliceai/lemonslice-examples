# websocket-test

Example app for LemonSlice **websocket** transport: audio in over a tunnel WebSocket, avatar A/V out over **Daily** or **LiveKit** (you choose on the landing page).

https://github.com/user-attachments/assets/5235b92e-1f19-4211-9cf7-292958974edc


## What this demonstrates

- Selecting Daily vs LiveKit egress on the landing page
- Creating a Daily or LiveKit room and minting relevant tokens. These are used by LemonSlice to publish video to the selected transport provider.
- The same call UI pattern as the other examples (placeholder `welcome.mp4`, ringing, expanded avatar)
- Tunnel WebSocket audio ingress (`websocket_address` from create-session)
- **Send WAV** / **Interrupt**, heartbeat, terminate, and a websocket event log

## Prerequisites

- Node.js 18+ and pnpm
- Python 3.10+ and pip
- `LEMONSLICE_API_KEY`
- For Daily: `DAILY_API_KEY`
- For LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

## Installation

```bash
pnpm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill in keys for the egress you will use
```

## Environment

```env
LEMONSLICE_API_KEY=your_api_key

# Daily egress
DAILY_API_KEY=

# LiveKit egress
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

The avatar image is loaded from `assets/agent.jpg` and sent as `agent_image_base64`.

## Run

```bash
pnpm run dev:all
```

Open `http://localhost:5173`, pick Daily or LiveKit in the side menu, click **Start call**, then **Send sample.wav** and/or **Interrupt**.

## Architecture

```
Browser
  │
  ├─ POST http://localhost:3001/create-session { egress: daily|livekit }
  │     ├─ create Daily room+tokens  OR  mint LiveKit agent/viewer tokens
  │     └─► POST …/api/liveai/sessions
  │           transport_type: websocket-daily | websocket-livekit
  │           daily_properties | livekit_properties  (agent credentials)
  │
  ├─ Daily.join / LiveKitRoom   # viewer credentials from this app
  │
  └─ wss://…tunnel…   # websocket_address from create-session
        audio / audio_end / interrupt / heartbeat / terminate
```

## Ports

| Service | Port |
| --- | --- |
| Vite frontend | 5173 |
| Example backend (create-session) | 3001 |
