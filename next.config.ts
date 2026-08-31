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
  },
};

export default nextConfig;