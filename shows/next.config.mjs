/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app is nested inside the scene-radar repo, which has its own lockfile.
  // Pin the root so Next doesn't infer the parent directory and warn on every build.
  turbopack: { root: import.meta.dirname },
};
export default nextConfig;
