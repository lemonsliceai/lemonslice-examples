"use client";

import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { Button } from "@/components/ui/button";

/**
 * Shown from the moment the call starts until the avatar publishes video, both
 * before the LiveKit token exists and after the browser has joined the room.
 */
export function RingingView({ placeholderVideo }: { placeholderVideo: string | null }) {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <AgentVideoView compact placeholderVideoUrl={placeholderVideo} agentVideoTrack={null} />
      <Button size="default" disabled variant="secondary">
        Calling…
      </Button>
    </div>
  );
}
