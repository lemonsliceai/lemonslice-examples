Pipecat backend service for the `05-pipecat-app` example.

This service starts a LemonSlice Pipecat session, runs the STT/LLM/TTS pipeline, and returns the Daily room URL for the Next.js frontend.

Commands from `agent/`:

```bash
uv sync
uv run uvicorn src.server:app --reload --host 127.0.0.1 --port 7860
```
