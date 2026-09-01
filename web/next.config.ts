import type { NextConfig } from "next";
import path from "node:path";

const isProduction = process.env.NODE_ENV === "production";
const developmentOnlyStub = path.resolve(
  process.cwd(),
  "src/components/dev/DevelopmentOnlyStub.tsx",
);

const nextConfig: NextConfig = {
  agentRules: false,
  // Le package.json accidentel à la racine du dépôt ne doit pas devenir le workspace Turbopack.
  turbopack: {
    root: path.resolve(process.cwd()),
    ...(isProduction
      ? {
          resolveAlias: {
            "@/components/dev/DevelopmentDialRoot": developmentOnlyStub,
            "@/components/home/HeroPaperDevelopmentBridge": developmentOnlyStub,
          },
        }
      : {}),
  },
  webpack(config, { dev, webpack }) {
    if (!dev) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /DevelopmentDialRoot$/,
          developmentOnlyStub,
        ),
        new webpack.NormalModuleReplacementPlugin(
          /HeroPaperDevelopmentBridge$/,
          developmentOnlyStub,
        ),
      );
    }
    return config;
  },
};

export default nextConfig;
