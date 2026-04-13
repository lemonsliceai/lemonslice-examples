# LemonSlice Examples

A collection of LemonSlice API integration examples.

## Curious where to get started?

Not sure which integration path fits your product? Read the [LemonSlice intro](https://lemonslice.com/docs/overview/intro) for an overview of **Hosted Pipeline** versus **Self-Managed Pipeline**.

- **Hosted Pipeline** — LemonSlice manages the full conversational AI pipeline; you are responsible for the frontend UI.
- **Self-Managed Pipeline** — You are responsible for managing the full conversational AI pipeline; LemonSlice operates on top of your voice stack by returning synchronized audio and video from an input audio stream.

## Folder Structure

### [01-hosted-daily-app](./01-hosted-daily-app/)

This full-stack example uses the LemonSlice Hosted Pipeline with Daily. Your backend creates the room, attaches a LemonSlice agent, and keeps LemonSlice API credentials on the server while users join from the browser. The project also includes UI and server endpoints for sending text messages to the agent, so you can steer the avatar with typed input alongside the voice call.

### [02-livekit-playground-demo](./02-livekit-playground-demo/)

For quick iteration of new LiveKit agents using the LemonSlice avatar plugin. Run the agent locally and connect to it in the LiveKit playground.

### [03-livekit-app-python](./03-livekit-app-python/)

End-to-end example showing how to use the LemonSlice Self-Managed Pipeline with our LiveKit integration. A Next.js app provides the UI and issues room tokens; a Python LiveKit Agents worker runs your pipeline (STT, LLM, TTS) and uses LemonSlice for the avatar. The LiveKit agent in this example is implemented with the [LiveKit Python SDK](https://github.com/livekit/agents).

### [04-livekit-app-nodejs](./04-livekit-app-nodejs/)

Same as `03-livekit-app-python`, but the LiveKit/LemonSlice agent is implemented with the [LiveKit Node.js SDK](https://github.com/livekit/agents-js).

### [05-pipecat-app](./05-pipecat-app/)

End-to-end example showing how to use the LemonSlice Self-Managed Pipeline with our [Pipecat](https://www.pipecat.ai/) integration. A Next.js frontend (same pre-join and in-call flow as the LiveKit examples) joins a Daily room; a Python FastAPI service runs Pipecat and wires the LemonSlice avatar into that pipeline.

## Getting Started

Each folder is self-contained with its own setup guide. Open the folder you want and follow its README.
