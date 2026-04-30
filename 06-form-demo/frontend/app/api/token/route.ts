import { NextRequest, NextResponse } from "next/server";
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";

/** Same value as agent `LIVEKIT_AGENT_NAME` — requests this worker via explicit dispatch. */
const DEFAULT_AGENT_NAME = "form-demo";

export async function GET(request: NextRequest) {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitAgentName = process.env.LIVEKIT_AGENT_NAME || DEFAULT_AGENT_NAME;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET" },
      { status: 500 },
    );
  }

  const roomName = request.nextUrl.searchParams.get("room") ?? "demo";
  const identity =
    request.nextUrl.searchParams.get("identity") ?? `user-${Math.random().toString(36).slice(2, 10)}`;

  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: livekitAgentName })],
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, url: livekitUrl, roomName, identity });
}
