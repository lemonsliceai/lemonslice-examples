# livekit-zoom

Send a [LemonSlice](https://www.lemonslice.com/) avatar into a third-party video meeting — Zoom, Google Meet, Microsoft Teams, or Webex — using [LiveKit Agents](https://docs.livekit.io/agents/).

The agent joins the meeting as a bot participant with your avatar on camera, listens to meeting audio, and responds with low-latency voice + animation.

## Prerequisites

- Python 3.10 to 3.12
- [uv](https://github.com/astral-sh/uv) package manager
- [LiveKit CLI](https://docs.livekit.io/home/cli/) (`lk`) for dispatching jobs
- API keys for:
  - LiveKit (URL, API key, and API secret)
  - LemonSlice
  - Groq
  - ElevenLabs

## Install

As of **2026-07-02**, external meeting support (`AvatarSession.join_meeting`) is merged on [livekit/agents](https://github.com/livekit/agents) `main` but not yet in a PyPI release. This example installs `livekit-plugins-lemonslice` from that branch; everything else installs from PyPI (see `pyproject.toml`).

```bash
cd 07-livekit-zoom
GIT_LFS_SKIP_SMUDGE=1 uv sync
```

The LiveKit agents repo uses Git LFS for example assets that aren't needed to install the Python packages. Skipping LFS smudge avoids a checkout error during `uv sync`.

## Setup

1. Copy env vars:

   ```bash
   cp .env.example .env
   ```

2. Fill in `.env`:

   ```env
   LEMONSLICE_API_KEY=your_lemonslice_api_key
   LEMONSLICE_IMAGE_URL=https://example.com/your-avatar.png
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   GROQ_API_KEY=your_groq_api_key
   ELEVEN_API_KEY=your_elevenlabs_api_key
   ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
   ```

   `LEMONSLICE_IMAGE_URL` must be a publicly accessible image URL for the avatar portrait.

## Run the agent worker

Start the worker locally (registers as agent name `zoom-bot`):

```bash
uv run python agent.py dev
```

## Dispatch into a meeting

With the worker running, create a dispatch job with the meeting link and bot display name in metadata:

```bash
lk dispatch create \
  --new-room \
  --agent-name zoom-bot \
  --metadata '{"meeting_url":"<MEETING LINK>", "bot_name": "My Avatar", "listen_to_meeting_chat": true}'
```

Replace `<MEETING LINK>` with the full join URL for your platform.

**Zoom:** include the password in the URL query string (do not pass it separately). Example:

```
https://us05web.zoom.us/j/12345678901?pwd=abc123xyz
```

**Google Meet / Microsoft Teams / Webex:** use the standard invite link from the calendar event.

`bot_name` is optional; it sets the display name of the bot in the meeting.

`listen_to_meeting_chat` is optional (defaults to `true`); when enabled, chat messages in the meeting are relayed into the agent session.

## Agent stack

This example uses a agent stack optimized for fast response times:

| Component | Provider |
|-----------|----------|
| STT | Deepgram Nova-2 (via LiveKit Inference) |
| LLM | Groq `llama-3.3-70b-versatile` |
| TTS | ElevenLabs `eleven_flash_v2_5` |
| Avatar | LemonSlice |

## Additional resources

- [LiveKit Agents documentation](https://docs.livekit.io/agents/)
- [LemonSlice LiveKit integration](https://lemonslice.com/docs/api-reference/livekit-agent-integration)
- [LiveKit agent dispatch](https://docs.livekit.io/agents/build/dispatch/)
