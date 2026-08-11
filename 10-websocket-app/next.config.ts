import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// 127.0.0.1 rather than localhost: Node resolves localhost to ::1 first, which uvicorn does not bind.
const BRIDGE_ORIGIN = process.env.BRIDGE_ORIGIN ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },
  async rewrites() {
    // Covers the /api/bridge/:id WebSocket too, so the browser only ever talks
    // to the Next origin.
    return [{ source: "/api/:path*", destination: `${BRIDGE_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
