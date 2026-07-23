import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the file-tracing root to THIS project (there are other lockfiles higher
  // up the tree). Keeps Vercel's serverless bundle scoped correctly.
  outputFileTracingRoot: projectRoot,

  // Cache headers for the embeddable widget bundle (public/widget.js, built by
  // `build:widget` → chained into `prebuild`). The stable /widget.js gets a
  // short TTL so fixes propagate to already-embedded clients without them
  // touching their snippet; a future version-pinned /widget.vN.js (SRI-
  // conscious clients) gets a long, immutable one instead.
  async headers() {
    return [
      {
        source: "/widget.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/widget.:ver(v[0-9]+).js",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
