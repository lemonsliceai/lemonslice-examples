# LemonSlice Examples

A collection of LemonSlice API integration examples.

## Folder Structure

### [01-hosted-daily-app](./01-hosted-daily-app/)

Demonstrates how to use the LemonSlice Hosted Pipeline in a simple web app. The hosted pipeline is a fully managed conversational AI service. Use it when you want to control the frontend experience while letting LemonSlice handle everything else.

### [02-livekit-playground-demo](./02-livekit-playground-demo/)

For quick iteration of new LiveKit agents using the LemonSlice avatar plugin. Run the agent locally and connect to it in the LiveKit playground.

### [03-livekit-app-python](./03-livekit-app-python/)

End-to-end example showing how to use the LemonSlice Self-Managed Pipeline with the LiveKit integration. You should use the self-managed pipeline when you want full control over every component of your video agent - for example, by using your own STT, LLM, and TTS components. LemonSlice handles avatar (video) generation only. You manage orchestration, infrastructure, and UI. The LiveKit agent is managed with the [LiveKit Python SDK](https://github.com/livekit/agents).

### [04-livekit-app-nodejs](./04-livekit-app-nodejs/)

Same as `03-livekit-app-python`, but the LiveKit/LemonSlice agent is hosted with the [LiveKit Node.js SDK](https://github.com/livekit/agents-js).

### [05-pipecat-app](./05-pipecat-app/)

End-to-end self-managed example using [Pipecat](https://www.pipecat.ai/) with LemonSlice transport and a Next.js frontend that joins the Daily room.

## Getting Started

Each folder is self-contained with its own setup guide. Open the folder you want and follow its README.
