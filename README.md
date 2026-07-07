# LemonSlice Examples

[LemonSlice](https://lemonslice.com) generates real-time, interactive video avatars for voice and video agent applications. Video is lip-synced over WebRTC and generated zero-shot from any reference image.

Already running a voice agent? Keep your STT, LLM, and TTS. LemonSlice adds synced avatar video on top, streamed into the same session. These repos show how to connect it with [LiveKit](https://lemonslice.com/docs/livekit), [Pipecat](https://lemonslice.com/docs/pipecat), or the hosted pipeline.

[![LemonSlice product launch](https://img.youtube.com/vi/bQf5h0WD-48/hqdefault.jpg)](https://www.youtube.com/watch?v=bQf5h0WD-48)

<video src="docs/example-demo-trimmed.mp4" width="100%" autoplay loop muted playsinline></video>

[Video](docs/example-demo-trimmed.mp4)

## Model capabilities

Generate avatars from any reference image — photorealistic humans, cartoons, animals, and brand mascots. No preset library or fine-tuning required. During a call you can update appearance, steer emotion, and trigger motion in real time. See the [docs intro](https://lemonslice.com/docs/introduction#model-capabilities) for examples.

## Integration overview

<img src="docs/self-managed-diagram.png" alt="Self-managed integration diagram" width="100%" />

LemonSlice adds a video layer on top of your agent stack. You bring your own STT, LLM, and TTS. LemonSlice listens to your agent's audio and streams lip-synced avatar video back into the session over WebRTC.

> The speed of your STT, LLM, and TTS directly affects avatar response time and interruption handling. Optimize for low latency to keep conversations natural.

| | **Self-managed** (LiveKit, Pipecat) | **Hosted pipeline** | **Widget** |
| --- | --- | --- | --- |
| **Best for** | Production agents, full control | Custom UI without running your own AI stack | No-backend site embeds |
| **You bring** | STT, LLM, TTS, and call UI | Call UI only | Nothing — paste a snippet |
| **LemonSlice runs** | Avatar video | Speech and intelligence | Speech, intelligence, and UI |
| **Avatar selection** | Any image at runtime | Designed in the web app | Designed in the web app |
| **In this repo** | [03](./03-livekit-app-python/), [04](./04-livekit-app-nodejs/), [05](./05-pipecat-app/), [06](./06-form-demo/), [07](./07-livekit-zoom/), [08](./08-green-screen-landscape-demo/) | [01-hosted-daily-app](./01-hosted-daily-app/) | — |

1. **Pick a framework** — [LiveKit](./03-livekit-app-python/) or [Pipecat](./05-pipecat-app/) integration guide.
2. **Build your UI** — run your own call lifecycle and frontend around the avatar session. See the [production checklist](https://lemonslice.com/docs/reference/production-checklist).

## Quickstart

**[03-livekit-app-python](./03-livekit-app-python/)** — Next.js frontend + LiveKit Agents worker (Python). A good place to begin if you want a self-managed pipeline with full control over STT, LLM, and TTS.

```bash
cd 03-livekit-app-python
cp .env.example .env.local   # add LIVEKIT_* and LEMONSLICE_API_KEY
npm install && cd agent && uv sync && cd ..
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000). See the [setup guide](./03-livekit-app-python/README.md) for details.

## Call UI demo

Pre-join, ringing, and in-call flow shared by the LiveKit and Pipecat examples:

https://github.com/user-attachments/assets/0c889262-1021-4918-878d-722930ffda5f

## Live demo

Try the full product at **[lemonslice.com](https://lemonslice.com)**.

## Examples

| | |
| --- | --- |
| **[03-livekit-app-python](./03-livekit-app-python/)** | End-to-end self-managed pipeline — Next.js UI, Python LiveKit Agents worker, LemonSlice avatar. |
| **[04-livekit-app-nodejs](./04-livekit-app-nodejs/)** | Same as `03`, with the agent in Node.js ([LiveKit Agents JS](https://github.com/livekit/agents-js)). |
| **[05-pipecat-app](./05-pipecat-app/)** | Same call UI as the LiveKit examples, using Daily + Pipecat instead. |
| **[02-livekit-playground-demo](./02-livekit-playground-demo/)** | Minimal agent for iterating in the [LiveKit playground](https://docs.livekit.io/home/cli/playground/). |
| **[01-hosted-daily-app](./01-hosted-daily-app/)** | Hosted pipeline — LemonSlice runs speech and intelligence; you build the frontend. |
| **[06-form-demo](./06-form-demo/)** | Tool calling in a LiveKit agent (AI SDR: email capture + meeting scheduling). |
| **[07-livekit-zoom](./07-livekit-zoom/)** | Send an avatar into Zoom, Meet, Teams, or Webex via LiveKit Agents. |
| **[08-green-screen-landscape-demo](./08-green-screen-landscape-demo/)** | Perform client-side green screen (chroma key) compositing to achieve a horizontal layout and animated background. |

Each folder is self-contained with its own README and setup steps.

## Docs

- [Introduction](https://lemonslice.com/docs/introduction) — product overview and integration options
- [LiveKit integration](https://lemonslice.com/docs/livekit)
- [Pipecat integration](https://lemonslice.com/docs/pipecat)
- [Production checklist](https://lemonslice.com/docs/reference/production-checklist)
