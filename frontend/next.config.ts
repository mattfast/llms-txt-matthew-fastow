import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid auto-generating AGENTS.md/CLAUDE.md scaffolding files on every dev server start.
  agentRules: false,
};

export default nextConfig;
