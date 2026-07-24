const BACKEND_BASE = "http://localhost:3001";

export type EgressProvider = "daily" | "livekit";

export type SessionResponse = {
  egress: EgressProvider;
  session_id?: string;
  websocket_address?: string;
  control_url?: string;
  room_url?: string;
  token?: string;
  livekit_url?: string;
  livekit_token?: string;
};

export class MissingApiKeyError extends Error {
  constructor() {
    super("Missing LEMONSLICE_API_KEY");
    this.name = "MissingApiKeyError";
  }
}

export class MissingDailyCredentialsError extends Error {
  constructor() {
    super("Missing DAILY_API_KEY");
    this.name = "MissingDailyCredentialsError";
  }
}

export class MissingLiveKitCredentialsError extends Error {
  constructor() {
    super("Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET");
    this.name = "MissingLiveKitCredentialsError";
  }
}

function throwForErrorCode(code: string | undefined): void {
  if (code === "missing_api_key") throw new MissingApiKeyError();
  if (code === "missing_daily_credentials") {
    throw new MissingDailyCredentialsError();
  }
  if (code === "missing_livekit_credentials") {
    throw new MissingLiveKitCredentialsError();
  }
}

export async function createSession(
  egress: EgressProvider,
): Promise<SessionResponse> {
  const response = await fetch(`${BACKEND_BASE}/create-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ egress }),
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: {
      detail?: string | { code?: string; message?: string };
    } | null = null;
    try {
      payload = JSON.parse(text) as {
        detail?: string | { code?: string; message?: string };
      };
    } catch {
      throw new Error(text || `Create session failed (${response.status})`);
    }

    if (typeof payload.detail === "object") {
      throwForErrorCode(payload.detail?.code);
      throw new Error(
        payload.detail?.message || `Create session failed (${response.status})`,
      );
    }

    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : `Create session failed (${response.status})`,
    );
  }

  return response.json();
}
