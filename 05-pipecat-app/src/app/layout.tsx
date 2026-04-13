import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pipecat + LemonSlice (Daily)",
  description: "Daily room frontend for LemonSlice self-managed Pipecat integration.",
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
