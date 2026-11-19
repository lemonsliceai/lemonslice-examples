"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { LiveKitAvatarReadyWatcher } from "@lemonsliceai/avatar/livekit-react";
import { RoomEvent, Track, isVideoTrack, type VideoTrack } from "livekit-client";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";

type CallViewProps = {
  ready: boolean;
  width: number;
  height: number;
  placeholderVideo: string | null;
  muted: boolean;
  micLevel: number;
  avatarSpeaking: boolean;
  message: string;
  toast: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onAvatarReady: () => void;
  onHangUp: () => void;
};

/** LemonSlice is the only publisher; the browser subscribes and never publishes. */
function useAvatarVideoTrack(): VideoTrack | null {
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera]);
  const remote = tracks.find(
    (t) =>
      t.publication.source === Track.Source.Camera &&
      t.participant?.identity !== room?.localParticipant?.identity,
  );
  const track = remote?.publication?.track;
  return track && isVideoTrack(track) ? track : null;
}

function CallInner({
  ready,
  width,
  height,
  placeholderVideo,
  toast,
  onAvatarReady,
  onHangUp,
  ...controls
}: CallViewProps) {
  const room = useRoomContext();
  const videoTrack = useAvatarVideoTrack();
  const [avatarReady, setAvatarReady] = useState(false);

  useEffect(() => {
    if (avatarReady && videoTrack) onAvatarReady();
  }, [avatarReady, videoTrack, onAvatarReady]);

  useEffect(() => {
    const onParticipantDisconnected = () => {
      if (room.remoteParticipants.size === 0) onHangUp();
    };
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [room, onHangUp]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {ready ? (
        <>
          <div className="relative flex flex-col items-center">
            <AgentVideoView
              compact={false}
              width={width}
              height={height}
              placeholderVideoUrl={placeholderVideo}
              agentVideoTrack={videoTrack}
            />
            {toast ? (
              <div
                className="absolute left-2 right-2 z-10 flex justify-center"
                style={{ bottom: 16 }}
              >
                <div className="mx-auto max-w-[90%] overflow-hidden rounded-2xl bg-black/20 px-3 py-2 text-center text-sm text-white backdrop-blur-xl">
                  <div className="line-clamp-4">{toast}</div>
                </div>
              </div>
            ) : null}
          </div>
          <CallControlsBar {...controls} onHangUp={onHangUp} />
        </>
      ) : null}

      <LiveKitAvatarReadyWatcher onReady={() => setAvatarReady(true)} />
      <RoomAudioRenderer />
    </div>
  );
}

export function LiveKitCallView({
  serverUrl,
  token,
  ...inner
}: CallViewProps & { serverUrl: string; token: string }) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio={false}
      video={false}
      onDisconnected={inner.onHangUp}
      className="flex w-full flex-col items-center justify-center"
    >
      <CallInner {...inner} />
    </LiveKitRoom>
  );
}
