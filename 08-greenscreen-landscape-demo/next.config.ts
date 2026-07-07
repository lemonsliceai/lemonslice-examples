import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Avoid picking up a parent `package-lock.json` when `/Users/bryceli/dev` has one.
  turbopack: { root: projectRoot },
};

export default nextConfig;
