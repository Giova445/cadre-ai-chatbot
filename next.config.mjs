/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the KB embeddings artifact out of the client bundle; it is only read
  // server-side by the /api/chat route.
  serverExternalPackages: [],
};

export default nextConfig;
