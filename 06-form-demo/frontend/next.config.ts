import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single repo-root `.env` for LiveKit + LemonSlice (same as the old Express token server).
loadEnv({ path: path.resolve(__dirname, "..", ".env") });

const nextConfig: NextConfig = {
  // Repo has another lockfile under ~/dev; pin tracing to this app.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
