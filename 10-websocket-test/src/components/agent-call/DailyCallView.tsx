import { useEffect, useRef, useState } from "react";
import {
  DailyProvider,
  useAudioTrack,
  useCallObject,
  useDaily,
  useDailyEvent,
  useParticipantIds,
  useVideoTrack,
} from "@daily-co/daily-react";
import { useAvatarReady } from "@lemonsliceai/avatar/react";
import { PhoneIcon } from "@heroicons/react/16/solid";
import { Button } from "@/components/ui/button";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { useActiveSize } from "@/hooks/useActiveSize";

type DailyParticipant = {
  local?: boolean;
  user_name?: string;
};

function DailyCallInner({
  roomUrl,
  token,
  placeholderVideo,
  onHangUp,
  onReadyChange,
}: {
  roomUrl: string;
  token: string;
  placeholderVideo: string;
  onHangUp: () => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const callObject = useDaily();
  const [isBotReady, setIsBotReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const activeSize = useActiveSize();

  useEffect(() => {
    if (!callObject || joined) return;
    let cancelled = false;
    void (async () => {
      await callObject.join({
        url: roomUrl,
        token,
        audioSource: false,
        videoSource: false,
      });
      if (!cancelled) setJoined(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [callObject, joined, roomUrl, token]);

  const avatarParticipantIds = useParticipantIds({
    filter: (p: DailyParticipant) =>
      !p.local && p.user_name?.trim().toLowerCase() === "lemonslice",
  });
  const remoteParticipantIds = useParticipantIds({ filter: "remote" });
  const selectedRemoteParticipantId =
    avatarParticipantIds[0] ?? remoteParticipantIds[0] ?? null;

  const audioTrackState = useAudioTrack(selectedRemoteParticipantId ?? "local");
  const videoTrackState = useVideoTrack(selectedRemoteParticipantId ?? "local");
  const audioTrack = selectedRemoteParticipantId
    ? (audioTrackState.track ?? null)
    : null;
  const videoTrack = selectedRemoteParticipantId
    ? (videoTrackState.track ?? null)
    : null;

  useAvatarReady(videoTrack, {
    enabled: Boolean(selectedRemoteParticipantId),
    onReady: () => setIsBotReady(true),
  });

  useDailyEvent("left-meeting", onHangUp);

  useEffect(() => {
    onReadyChange?.(isBotReady);
  }, [isBotReady, onReadyChange]);

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el || !audioTrack) return;
    const stream = new MediaStream([audioTrack]);
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [audioTrack]);

  const avatarJoined = Boolean(selectedRemoteParticipantId);
  const compactLayout = !(avatarJoined && isBotReady);
  const displayVideoTrack = compactLayout ? null : videoTrack;

  return (
    <div className="flex flex-col items-center gap-4">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <AgentVideoView
        compact={compactLayout}
        width={activeSize.width}
        height={activeSize.height}
        placeholderVideoUrl={placeholderVideo}
        agentVideoTrack={displayVideoTrack}
      />
      {!compactLayout ? (
        <CallControlsBar onHangUp={onHangUp} />
      ) : (
        <div className="flex items-center gap-2">
          <Button size="default" disabled variant="secondary">
            Calling…
          </Button>
          <Button
            onClick={onHangUp}
            variant="destructive"
            size="icon"
            className="h-11 w-11 flex-shrink-0 rounded-full bg-red-500"
            title="Hang up"
          >
            <PhoneIcon className="h-5 w-5 translate-y-0.5 rotate-[135deg]" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function DailyCallView(props: {
  roomUrl: string;
  token: string;
  placeholderVideo: string;
  onHangUp: () => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const callObject = useCallObject({});
  return (
    <DailyProvider callObject={callObject}>
      <DailyCallInner {...props} />
    </DailyProvider>
  );
}
