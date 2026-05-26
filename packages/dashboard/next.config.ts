import type { NextConfig } from "next";
import { z } from "zod";

// Validate env at build / server startup — fails fast on missing config.
// Inline here to avoid importing a local .ts file that doesn't exist as .js
// when Next.js executes the transpiled config with Node.js.
z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
}).parse(process.env);

const nextConfig: NextConfig = {};

export default nextConfig;
