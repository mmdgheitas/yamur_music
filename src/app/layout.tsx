import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AudioPlayerProvider } from "@/contexts/audio-player-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cafe Audio · Self-hosted music control",
  description:
    "Autonomous Cafe Audio Management System — local-first playlists, drag & drop ordering, range-streaming playback and Telegram ingest.",
};

export const viewport: Viewport = {
  themeColor: "#0b0907",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <AudioPlayerProvider>{children}</AudioPlayerProvider>
      </body>
    </html>
  );
}
