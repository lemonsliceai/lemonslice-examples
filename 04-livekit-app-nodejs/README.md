# livekit-app-nodejs

End-to-end example showing how to use the LemonSlice Self-Managed API with LiveKit integration. It follows the same self-managed model as `03-livekit-app-python` (bring your own STT, LLM, and TTS while LemonSlice handles avatar generation), but builds the LiveKit agent using the [LiveKit Node.js SDK](https://github.com/livekit/agents-js).

## Screenshots

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="no-call.png" alt="Frontend before joining a call" width="380" /><br />
      <sub>Before joining</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="calling-state.png" alt="Frontend while in a call" width="380" /><br />
      <sub>In a call</sub>
    </td>
  </tr>
</table>

Project layout:


| Path                                         | What                              |
| -------------------------------------------- | --------------------------------- |
| **Next.js app** (repo root) and `/api/token` | Frontend and token server         |
| `agent/`                                     | Node.js **LiveKit Agents** worker |


## Setup

1. **Environment** — copy and edit at the **repo root** (both Next and the worker read `.env.local` here):
  ```bash
   cp .env.example .env.local
  ```

  | Variable(s)                                            | Used by                                                                              |
  | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
  | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Next token route, agent room connection, and **LiveKit Inference** (STT + LLM + TTS) |
  | `LEMONSLICE_API_KEY`                                   | Find this in your [LemonSlice account page.](https://lemonslice.com/account)         |

2. **Install**
  ```bash
   npm install
   npm install --prefix agent
  ```

## Run locally

Pick **one** of these—do not run both at once.

**Default (simplest): one command**

Starts the Next.js app (UI + token API) and the agent worker together:

```bash
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000), join a room in the browser; with default dispatch, the worker should enter the same LiveKit project.

**Alternative: two terminals**

Same result, but you run each process yourself:


| Terminal | Command             | What it runs                                                             |
| -------- | ------------------- | ------------------------------------------------------------------------ |
| **A**    | `npm run dev`       | Web + `/api/token` (Next.js)                                             |
| **B**    | `npm run dev:agent` | Agent worker (`vite build` then `node dist/main.js dev` inside `agent/`) |


Open [http://localhost:3000](http://localhost:3000) after **A** is up.

## Deploy

- **Next app** (e.g. Vercel): set `LIVEKIT_*` in project env. Do not expose API secret to the client.
- **Agent**: deploy separately ([LiveKit agent deployment](https://docs.livekit.io/agents/ops/deployment/)) with the same `LIVEKIT_*`, plus `LEMONSLICE_API_KEY`.

## How the token server works with LiveKit

Browsers cannot safely hold `LIVEKIT_API_SECRET`. So **only your server** (here: `src/app/api/token/route.ts`) uses the secret to **sign** a JWT. The browser calls your app, gets `{ token, serverUrl, room }`, then the LiveKit client library connects to `serverUrl` (your `LIVEKIT_URL`) using `token`.

What the route does, in order:

1. Reads optional query params `room` and `participant`. If omitted, it picks a random room name and participant identity so you can open the page without thinking about names.
2. Loads `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` from the environment (same vars the agent uses to talk to the **same** LiveKit project).
3. Builds an **access token** with `livekit-server-sdk`: identity, display name, TTL (here **1 hour**).
4. **Grants** permission to join that specific room, **publish** (send mic/audio), and **subscribe** (hear/see others). That matches a normal user joining a voice/video room.
5. Returns the signed JWT as `token`, plus `serverUrl` and `room` so the client knows where to connect and which room name to use.

So: **LiveKit** trusts the JWT because it was signed with the API secret; **your backend** is the only place that secret exists. If you deploy to Vercel (or similar), set `LIVEKIT_*` in the host’s env — never expose the secret to client-side code or public repos.

**Token API (reference)**

- `GET` or `POST` `/api/token`
- Query: optional `room`, `participant`
- Response: `{ token, serverUrl, room }`

## Agent source

See `agent/src/main.ts`. **LLM** and **STT** use `inference.LLM` and `inference.STT`. **TTS** uses `**inference.TTS`** with an `elevenlabs/…` model—not `[@livekit/agents-plugin-elevenlabs](https://www.npmjs.com/package/@livekit/agents-plugin-elevenlabs)`. Swap `AGENT_IMAGE_URL` / models in that file as needed.

### ElevenLabs: inference vs the plugin

This repo routes ElevenLabs **through LiveKit Inference** instead of the dedicated ElevenLabs plugin.


| Topic          | **LiveKit Inference (`inference.TTS`)** — *this repo*                                                                                                                                                                                                                                                                                            | `**@livekit/agents-plugin-elevenlabs`**                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | Same `**LIVEKIT_API_KEY`** / `**LIVEKIT_API_SECRET**` as LLM and STT (JWT to the inference gateway). No ElevenLabs API key in env.                                                                                                                                                                                                               | Set `**ELEVENLABS_API_KEY**` (or the env name your plugin version expects) from the [ElevenLabs dashboard](https://elevenlabs.io/). |
| **Voices**     | Only **default** voices listed in the [ElevenLabs inference voice table](https://docs.livekit.io/agents/models/tts/inference/elevenlabs/#voices). Example in code: **Jessica** with `elevenlabs/eleven_turbo_v2_5` and voice id `cgSgspJ2msm6clMCkdW9`. Custom/community voices from your ElevenLabs account are **not** available on this path. | Use `**voiceId`** for any voice your API key can access (including custom voices).                                                  |
| **Code shape** | `new inference.TTS({ model: "elevenlabs/eleven_turbo_v2_5", voice: "…", language: "en" })` — option is `**voice`**, not `voiceId`.                                                                                                                                                                                                               | `new elevenlabs.TTS({ model: "…", voiceId: "…", … })`.                                                                              |


