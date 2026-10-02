import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingExcludes: { "/*": ["./.chatgpt/**/*", "./.env*.local"] },
  outputFileTracingIncludes: {
    "/api/samples/**": ["./samples/**/*"],
  },
};

export default config;
