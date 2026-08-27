import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  agentRules: false,
  // Le package.json accidentel à la racine du dépôt ne doit pas devenir le workspace Turbopack.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
