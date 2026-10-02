import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/api/samples/**": ["./samples/**/*"],
  },
};

export default config;
