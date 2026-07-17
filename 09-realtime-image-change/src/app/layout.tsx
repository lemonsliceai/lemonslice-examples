import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemonSlice — Realtime Image Change",
  description: "Demo of LemonSlice update-image with LiveKit Agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
