import type { NextConfig } from "next";

import { loadEnv } from "./src/env.js";

// Validate env at build / server startup — fails fast on missing config.
loadEnv();

const nextConfig: NextConfig = {};

export default nextConfig;
