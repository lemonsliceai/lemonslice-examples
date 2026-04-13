import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.PIPECAT_BACKEND_URL ?? "http://127.0.0.1:7860";
const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_BASE_URL = "https://api.daily.co/v1";

async function createDailyRoom() {
  if (!DAILY_API_KEY) throw new Error("Missing DAILY_API_KEY");
  const roomName = `lemonslice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(`${DAILY_API_BASE_URL}/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: roomName,
      properties: {
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
        eject_at_room_exp: true,
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || !payload?.url || !payload?.name) {
    throw new Error(`Failed creating Daily room: ${JSON.stringify(payload)}`);
  }
  return { roomUrl: payload.url as string, roomName: payload.name as string };
}

async function createDailyToken(roomName: string) {
  if (!DAILY_API_KEY) throw new Error("Missing DAILY_API_KEY");
  const response = await fetch(`${DAILY_API_BASE_URL}/meeting-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: true,
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || !payload?.token) {
    throw new Error(`Failed creating Daily token: ${JSON.stringify(payload)}`);
  }
  return payload.token as string;
}

export async function POST() {
  try {
    const { roomUrl, roomName } = await createDailyRoom();
    const token = await createDailyToken(roomName);

    const response = await fetch(`${BACKEND_BASE_URL}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        daily_room_url: roomUrl,
        daily_token: token,
      }),
      cache: "no-store",
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    return NextResponse.json({
      room_url: payload.room_url ?? roomUrl,
      token,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to start Pipecat session",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/session`, {
      method: "DELETE",
      cache: "no-store",
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to stop Pipecat session",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
