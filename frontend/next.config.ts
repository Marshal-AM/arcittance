import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit reads Helvetica.afm from its package data/ dir — must not be webpack-bundled
  serverExternalPackages: ["pdfkit"],
  // Allow imports from monorepo root (circle/ package)
  experimental: {
    externalDir: true,
  },
  // Prevents false workspace-root detection when multiple lockfiles exist
  outputFileTracingRoot: path.join(__dirname, "../"),
  outputFileTracingIncludes: {
    "/api/remittances/[id]/receipt": [
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },
  webpack: (config) => {
    // Silence missing optional dependencies from MetaMask SDK and WalletConnect
    // that are only needed in React Native / Node environments.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
