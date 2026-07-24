import { useEffect, useMemo, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { LiveKitAvatarReadyWatcher } from "@lemonsliceai/avatar/livekit-react";
import { Track, isVideoTrack } from "livekit-client";
import { PhoneIcon } from "@heroicons/react/16/solid";
import { Button } from "@/components/ui/button";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { useActiveSize } from "@/hooks/useActiveSize";

function useRemoteAgentMediaStreamTrack() {
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera]);
  const remoteVideo = tracks.find(
    (t) =>
      t.publication.source === Track.Source.Camera &&
      t.participant?.identity !== room?.localParticipant?.identity,
  );
  const raw = remoteVideo?.publication?.track;
  const videoTrack = raw && isVideoTrack(raw) ? raw : null;
  const mediaStreamTrack = useMemo(
    () => videoTrack?.mediaStreamTrack ?? null,
    [videoTrack],
  );
  return { mediaStreamTrack, hasRemoteVideo: videoTrack != null };
}

function LiveKitCallInner({
  placeholderVideo,
  onHangUp,
  onReadyChange,
}: {
  placeholderVideo: string;
  onHangUp: () => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [avatarReady, setAvatarReady] = useState(false);
  const { mediaStreamTrack, hasRemoteVideo } = useRemoteAgentMediaStreamTrack();
  const activeSize = useActiveSize();
  const compactLayout = !(hasRemoteVideo && avatarReady);
  const displayTrack = compactLayout ? null : mediaStreamTrack;

  useEffect(() => {
    onReadyChange?.(avatarReady && hasRemoteVideo);
  }, [avatarReady, hasRemoteVideo, onReadyChange]);

  return (
    <div className="flex flex-col items-center gap-4">
      <AgentVideoView
        compact={compactLayout}
        width={activeSize.width}
        height={activeSize.height}
        placeholderVideoUrl={placeholderVideo}
        agentVideoTrack={displayTrack}
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
      <LiveKitAvatarReadyWatcher onReady={() => setAvatarReady(true)} />
      <RoomAudioRenderer />
    </div>
  );
}

export function LiveKitCallView({
  serverUrl,
  token,
  placeholderVideo,
  onHangUp,
  onReadyChange,
}: {
  serverUrl: string;
  token: string;
  placeholderVideo: string;
  onHangUp: () => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio={false}
      video={false}
      onDisconnected={onHangUp}
      style={{ height: "100%" }}
    >
      <LiveKitCallInner
        placeholderVideo={placeholderVideo}
        onHangUp={onHangUp}
        onReadyChange={onReadyChange}
      />
    </LiveKitRoom>
  );
}
