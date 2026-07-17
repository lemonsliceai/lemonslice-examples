# realtime-image-change

End-to-end demo of LemonSlice **realtime image updates** (`update-image`) on a LiveKit self-managed pipeline.

Uses the [Control self-managed session](https://lemonslice.com/docs/api-reference/control-self-managed-session) API:

```json
{ "event": "update-image", "image_url": "https://example.com/avatar.jpg" } // public URL
{ "event": "update-image", "image_base64": "<base64-encoded image>" } // inline bytes
```

## What this demo shows

https://github.com/user-attachments/assets/8750b7fe-b3aa-40f0-b273-7391ca3006e8

Three ways to trigger `update-image`:

1. **LLM tools** — conversation picks a preset (`go_to_work`, `go_outside`, …)
2. **URL or upload** — panel sends `image_url` / `image_base64` via `agent/set_image`
3. **Fal edit** — panel prompt → Nano Banana → apply result

Then listen for completion: `image_change_complete` / `image_change_error` on the LemonSlice `lemonslice` topic.

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
   cd agent && uv sync
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
