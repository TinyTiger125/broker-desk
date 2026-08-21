import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    proxyClientMaxBodySize: "72mb",
    serverActions: {
      bodySizeLimit: "72mb",
    },
  },
  // @pdfme/converter uses clawpdf's Node PDFium loader. Keep both packages
  // external in server bundles so its runtime-resolved vendor/WASM assets are
  // available in Serverless functions instead of being inlined with a build-
  // machine file URL.
  serverExternalPackages: ["@pdfme/converter", "clawpdf"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }

    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
