import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/ESM-heavy server packages out of the bundler so audio
  // parsing and the Telegram bot run against their real Node builds.
  serverExternalPackages: ["music-metadata", "telegraf", "bcryptjs"],
  
  // تنظیم صحیح برای اجازه دادن به آی‌پی‌های شبکه‌ی محلی در محیط Dev
 allowedDevOrigins: [
  "localhost:3000",
  "172.20.10.2",
  "172.20.10.2:3000",
  "172.20.10.*", // اجازه به تمام آی‌پی‌های این رنج
  "*.e2b.app", // پیش‌نمایش آنلاین (محیط توسعه)
],
  experimental: {
    serverActions: {
      // Large audio uploads flow through route handlers, but keep head
      bodySizeLimit: "64mb",
    },
    // Next 16's proxy layer truncates request bodies at 10MB by default, which
    // would silently chop large audio uploads. Raise it past the app's 100MB
    // upload cap so the streamed /api/songs/upload body arrives intact.
    proxyClientMaxBodySize: "105mb",
  },
};

export default nextConfig;