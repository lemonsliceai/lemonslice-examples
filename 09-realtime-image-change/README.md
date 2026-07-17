# realtime-image-change

This repo provides an end-to-end demo of **real-time image updates** (`update-image`) during a LemonSlice call. At any point in the session, you can change the avatar’s reference image three ways: LLM tool calls that apply local presets (triggered via conversational context), directly from a user-provided URL or image upload, or a Nano Banana edit that generates a new image variant from a text prompt. The UI listens for `image_change_complete` / `image_change_error` so you can see when the video transition finishes. See our [guide](https://lemonslice.com/docs/reference/realtime-updates) for more information.

https://github.com/user-attachments/assets/8750b7fe-b3aa-40f0-b273-7391ca3006e8

## Layout

| Path | What |
| --- | --- |
| **Next.js app** (repo root) and `/api/token` | Frontend + token server |
| `agent/` | Python LiveKit Agents worker |
| `agent/assets/` | Local JPEG presets used by tool calls |

## Setup

1. **Environment** — copy and edit at the **repo root** (both Next and the worker read `.env.local` here):

   ```bash
   cp .env.example .env.local
   ```

   | Variable(s) | Used by |
   | --- | --- |
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Next token route, agent room connection, LiveKit Inference |
   | `AGENT_NAME` | Worker registration / dispatch |
   | `LEMONSLICE_API_KEY` | [Developer Portal](https://lemonslice.com/developers) |
   | `FAL_KEY` | Fal AI — required for Nano Banana edits ([fal.ai](https://fal.ai)) |

2. **Install** — install [uv](https://docs.astral.sh/uv/getting-started/installation/) first, then:

   ```bash
   npm install
   cd agent && uv sync && cd ..
   ```

## Run locally

```bash
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

Or two terminals: `npm run dev` and `npm run dev:agent`.

## Try it

1. Start a call and wait until the avatar expands (ready).
2. **Tools** — say “go to work”, “let’s go skiing” / “go outside”, or “put on sunglasses”.
3. **URL** — paste a public HTTPS image URL in the right panel → Apply URL.
4. **Upload** — choose a local image → applied via `image_base64`.
5. **Edit** — enter a prompt (e.g. “wearing stylish sunglasses”) → Generate & apply.

Watch the **Event log**. A transitional UI takes effect (iridescent border on the main video container) while waiting on Fal Nano Banana generation.
