# livekit-playground-demo

For quick iteration of new LiveKit agents using the [LemonSlice avatar plugin](https://lemonslice.com/docs/api-reference/livekit-agent-integration). Run the agent locally and connect to it in the LiveKit playground.

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

   Once your agent is running, you can connect to it using the [LiveKit Agent Playground](https://agents-playground.livekit.io/). Either select your LiveKit Cloud instance or manually enter your LiveKit URL and room token. Using LiveKit Cloud is recommended, as minting a room token requires [additional setup](https://docs.livekit.io/frontends/reference/tokens-grants/). 

## Additional Resources

- [LiveKit Playground](https://agents-playground.livekit.io/)
- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [LemonSlice API Reference](https://lemonslice.com/docs/api-reference/livekit-agent-integration)