# LiveKit LemonSlice Agent

A Python example that demonstrates how to integrate with the Lemon Slice API using the [LiveKit LemonSlice Plugin](https://lemonslice.com/docs/api-reference/livekit-agent-integration).

This example creates a LiveKit agent that uses LemonSlice to generate an avatar that can interact with users in real-time.

## Prerequisites

- Python 3.10 to 3.12
- [uv](https://github.com/astral-sh/uv) package manager
- API keys for:
  - LiveKit (URL, API key, and API secret)
  - LemonSlice
  - ElevenLabs

## Setup

1. **Install dependencies using uv:**

   ```bash
   uv sync
   ```

2. **Set env vars:**

   Create a `.env` file based on `.env.example` in the root directory with the following variables:

   ```env
   LEMONSLICE_API_KEY=your_lemonslice_api_key
   LIVEKIT_URL=your_livekit_url
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   ELEVEN_API_KEY=your_elevenlabs_api_key
   ```

3. **Start the agent:**

   ```bash
   uv run python agent.py dev
   ```

4. **Test Your Agent**

   Once your agent is running, you can connect to it using the [LiveKit Agent Playground](https://agents-playground.livekit.io/).
   Either select your LiveKit Cloud instance or manually enter our LiveKit URL and room token. 

## Additional Resources

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [LemonSlice API Reference](https://lemonslice.com/docs/api-reference/livekit-agent-integration)