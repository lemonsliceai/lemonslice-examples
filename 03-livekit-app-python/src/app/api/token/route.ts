import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function handleToken(request: NextRequest) {
  const url = request.nextUrl;
  const roomName = url.searchParams.get("room") ?? `room-${Date.now()}`;
  const agentName = (process.env.AGENT_NAME ?? "").trim();
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
  if (!agentName) {
    return NextResponse.json(
      { error: "Missing AGENT_NAME. Set it in .env.local." },
      { status: 500 },
    );
  }
  const roomMetadataJson = "{}";

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

  at.roomConfig = new RoomConfiguration({
    metadata: roomMetadataJson,
    agents: [
      new RoomAgentDispatch({
        agentName,
        metadata: roomMetadataJson,
      }),
    ],
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, serverUrl: LIVEKIT_URL, room: roomName, agentName });
}

export async function GET(request: NextRequest) {
  return handleToken(request);
}

export async function POST(request: NextRequest) {
  return handleToken(request);
}
