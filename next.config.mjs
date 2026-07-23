import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the file-tracing root to THIS project (there are other lockfiles higher
  // up the tree). Keeps Vercel's serverless bundle scoped correctly.
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
