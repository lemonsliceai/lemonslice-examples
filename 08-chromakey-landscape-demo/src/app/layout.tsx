import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemonSlice Chroma Key Demo",
  description: "Client-side chroma key compositing with LiveKit and LemonSlice",
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
