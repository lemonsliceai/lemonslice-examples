LiveKit **Agents** worker (Python): [`uv`](https://docs.astral.sh/uv/) + `pyproject.toml`.

Loads environment from the **repository root** `.env` / `.env.local` (same as Next.js).

From repo root: `npm run dev:agent` or `npm run dev:all`.

Equivalent commands from `agent/`:

```bash
uv sync
uv run python src/agent.py dev
```

Requires `LEMONSLICE_API_KEY`. For Nano Banana edits, also set `FAL_KEY`.
