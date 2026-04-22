import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemonSlice Example",
  description: "Video agent with LiveKit and LemonSlice",
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
