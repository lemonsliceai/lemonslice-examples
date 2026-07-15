# realtime-image-change

End-to-end demo of LemonSlice **realtime image updates** (`update-image`) on a LiveKit self-managed pipeline. Based on [03-livekit-app-python](../03-livekit-app-python/), with a split UI: call on the left, education + controls on the right.

Uses the [Control self-managed session](https://lemonslice.com/docs/api-reference/control-self-managed-session) API:

```json
{ "event": "update-image", "image_url": "https://example.com/avatar.jpg" }
```

## What this demo shows

1. **Tool-driven swaps** — LLM tools (`change_outfit`, `go_outside`, `add_sunglasses`) POST hardcoded public images via `update-image`.
2. **Custom image URL** — form publishes LiveKit data on `agent/set_image`; the worker applies it via LemonSlice `update-image`.
3. **Nano Banana 2 Lite edit** — form publishes app LiveKit data on `agent/image_edit`; the worker runs Fal [`google/nano-banana-2-lite/edit`](https://fal.ai/models/google/nano-banana-2-lite/edit), then applies the result with `update-image`.
4. **Transition UX** — UI listens for `image_accepted` (`agent/events`, app topic) and `image_change_complete` / `image_change_error` (`lemonslice` topic from LemonSlice), shows pipeline state on the right, and an iridescent edge ring on the video while transitioning. Tool-call spoken replies wait until `image_change_complete`.

`agent/set_image`, `agent/image_edit`, and `agent/events` are **this demo’s** LiveKit data topics — not LemonSlice product APIs. The LemonSlice product surface here is `POST .../control` with `event: update-image`, plus `image_change_*` on `lemonslice`.

## Layout

| Path | What |
| --- | --- |
| **Next.js app** (repo root) and `/api/token` | Frontend + token server |
| `agent/` | Python LiveKit Agents worker |

## Setup

1. **Environment** — copy and edit at the **repo root** (both Next and the worker read `.env.local` here):

   ```bash
   cp .env.example .env.local
   ```

   | Variable(s) | Used by |
   | --- | --- |
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Next token route, agent room connection, LiveKit Inference |
   | `AGENT_NAME` | Worker registration / dispatch |
   | `LEMONSLICE_API_KEY` | [LemonSlice account](https://lemonslice.com/account) |
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
2. **Tools** — say “change your outfit”, “let’s go outside”, or “put on sunglasses”.
3. **URL** — paste a public HTTPS image URL in the right panel → Apply.
4. **Edit** — enter a prompt (e.g. “wearing stylish sunglasses”) → Generate & apply.

Watch the **Pipeline state** panel and the rainbow edge on the video until `image_change_complete`.

## Event flow

```
client / tool
    → LemonSlice POST .../control { event: update-image, image_url }
    → agent publishes agent/events: image_accepted
    → avatar publishes lemonslice: image_change_complete | image_change_error
```

Image URLs must be **publicly reachable HTTPS** — LemonSlice’s servers fetch them (localhost will not work).

## Agent source

See `agent/src/agent.py` and `agent/src/lemonslice_control.py`.
