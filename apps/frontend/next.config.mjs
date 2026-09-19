import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
// The single root .env is shared with the backend. Only NEXT_PUBLIC_* variables are ever exposed to the browser bundle.
// MINGA_ENV_FILE / NEXT_DIST_DIR let the local stack (anvil) build side by side with the HSK build without touching it.
const envFile = process.env.MINGA_ENV_FILE ? path.resolve(process.env.MINGA_ENV_FILE) : path.resolve(here, "../../.env");
const parsed = dotenv.config({ path: envFile }).parsed ?? {};
const publicEnv = Object.fromEntries(Object.entries(parsed).filter(([k]) => k.startsWith("NEXT_PUBLIC_")));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@minga/shared"],
  env: publicEnv,
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Optional Node-only dependencies pulled by WalletConnect; not needed in the browser.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // `wagmi/connectors` re-exports the Coinbase Base Account connector, whose SDK imports optional x402 payment packages that
    // are not installed. This app never uses that connector (only injected + WalletConnect), so those imports are stubbed out.
    // The MetaMask SDK likewise references a React Native storage module that does not exist on the web.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false, "@x402/evm": false, "@x402/svm": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
