import type { LocalParticipant } from "livekit-client";

/**
 * App-specific LiveKit data topics (not LemonSlice product APIs).
 * The agent listens on these and calls LemonSlice `update-image` itself.
 */

/** Client → agent: apply a public image URL. */
export const AGENT_SET_IMAGE_TOPIC = "agent/set_image";

/** Client → agent: Fal Nano Banana 2 Lite edit, then apply. */
export const AGENT_IMAGE_EDIT_TOPIC = "agent/image_edit";

/** Client → agent: avatar video is ready; agent should greet. */
export const AGENT_AVATAR_READY_TOPIC = "agent/avatar_ready";

/** Agent → client notices (`image_accepted`, `image_update_failed`, …). */
export const AGENT_EVENTS_TOPIC = "agent/events";

/** LemonSlice transport RPC (`bot_ready`, `image_change_complete`, `image_change_error`). */
export const LEMONSLICE_RPC_TOPIC = "lemonslice";

/** Max wait for `image_change_complete` / `image_change_error` after `image_accepted`. */
export const IMAGE_CHANGE_TIMEOUT_MS = 60_000;

/** Max wait for Fal edit → `image_accepted` / `image_update_failed`. */
export const IMAGE_EDIT_TIMEOUT_MS = 120_000;

export type SetImageCommandPayload = {
  type: "set_image";
  image_url: string;
};

export type ImageEditCommandPayload = {
  type: "image_edit";
  request_id: string;
  prompt: string;
  source_image_url?: string;
};

export type ImageChangePhase =
  | "idle"
  | "sending"
  | "editing"
  | "accepted"
  | "transitioning"
  | "complete"
  | "error";

export type ImageChangeState = {
  phase: ImageChangePhase;
  /** Last image URL accepted by LemonSlice control (or base). */
  currentImageUrl: string | null;
  /** Human-readable status line for the education panel. */
  detail: string;
  lastEvent: string | null;
  error: string | null;
};

export async function publishSetImageCommand(
  participant: LocalParticipant,
  payload: SetImageCommandPayload,
): Promise<void> {
  const encoder = new TextEncoder();
  await participant.publishData(encoder.encode(JSON.stringify(payload)), {
    reliable: true,
    topic: AGENT_SET_IMAGE_TOPIC,
  });
}

export async function publishImageEditCommand(
  participant: LocalParticipant,
  payload: ImageEditCommandPayload,
): Promise<void> {
  const encoder = new TextEncoder();
  await participant.publishData(encoder.encode(JSON.stringify(payload)), {
    reliable: true,
    topic: AGENT_IMAGE_EDIT_TOPIC,
  });
}

export async function publishAvatarReady(participant: LocalParticipant): Promise<void> {
  const encoder = new TextEncoder();
  await participant.publishData(
    encoder.encode(JSON.stringify({ type: "avatar_ready" })),
    {
      reliable: true,
      topic: AGENT_AVATAR_READY_TOPIC,
    },
  );
}
