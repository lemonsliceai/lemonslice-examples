import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveKit voice (minimal)",
  description: "Mic + remote agent video/audio; no user camera. Next.js API token.",
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
