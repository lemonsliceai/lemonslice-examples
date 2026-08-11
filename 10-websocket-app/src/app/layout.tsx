import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemonSlice — ElevenLabs WebSocket Bridge",
  description: "ElevenLabs conversational agent driving a LemonSlice avatar in LiveKit",
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
