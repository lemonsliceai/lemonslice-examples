import { AccessToken } from "livekit-server-sdk";
import { type NextRequest, NextResponse } from "next/server";

async function handleToken(request: NextRequest) {
  const url = request.nextUrl;
  const roomName = url.searchParams.get("room") ?? `room-${Date.now()}`;
  const participantName =
    url.searchParams.get("participant") ??
    `user-${Math.random().toString(36).slice(2, 10)}`;

  const LIVEKIT_URL = process.env.LIVEKIT_URL;
  const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json(
      { error: "Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET" },
      { status: 500 },
    );
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    name: participantName,
    ttl: "1h",
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, serverUrl: LIVEKIT_URL, room: roomName });
}

export async function GET(request: NextRequest) {
  return handleToken(request);
}

export async function POST(request: NextRequest) {
  return handleToken(request);
}
