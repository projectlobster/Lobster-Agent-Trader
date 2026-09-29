import type { NextConfig } from "next";

/**
 * Set LOBSTER_DEMO=1 to build the landing page as a static bundle for GitHub
 * Pages. See scripts/build-demo.ts — Pages cannot host the console, which needs
 * a server, a Python process and a writable database.
 */
const isDemo = process.env.LOBSTER_DEMO === "1";

const nextConfig: NextConfig = {
  typedRoutes: false,
  // Only the landing page can be exported: every console route is
  // force-dynamic because it reads SQLite, so the build would fail on them.
  ...(isDemo ? { output: "export" as const } : {}),
  // The demo is served from a project subpath, so assets have to be requested
  // through it. basePath is deliberately not set: it also rewrites navigation
  // hrefs, and this site links to the repository rather than to sibling routes,
  // so the extra rewriting only creates paths that 404.
  ...(isDemo ? { assetPrefix: "/Lobster-Agent-Trader" } : {}),
  // Nothing here uses next/image, and an unoptimized build keeps the static
  // export free of a loader route that cannot exist.
  images: { unoptimized: true },
};

export default nextConfig;
