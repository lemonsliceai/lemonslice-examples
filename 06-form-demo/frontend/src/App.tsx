"use client";

import { RoomAudioRenderer } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentSidebar } from "./components/AgentSidebar";
import { Landing } from "./components/Landing";
import { PipelineHud } from "./components/PipelineHud";
import { PreConnectScreen } from "./components/PreConnectScreen";
import { useLiveKitRoom } from "./useLiveKitRoom";

/** Empty = same origin (`/api/token`). Set when the UI is hosted separately from the token API. */
const TOKEN_URL = process.env.NEXT_PUBLIC_TOKEN_URL ?? "";

type AppPhase = "preconnect" | "joining" | "demo";

export default function App() {
  const lk = useLiveKitRoom(TOKEN_URL);
  const [phase, setPhase] = useState<AppPhase>("preconnect");
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (phase === "joining" && lk.avatarJoined) {
      setPhase("demo");
    }
  }, [phase, lk.avatarJoined]);

  useEffect(() => {
    if (lk.connectionState === ConnectionState.Connected) {
      wasConnectedRef.current = true;
      return;
    }
    if (wasConnectedRef.current && lk.connectionState === ConnectionState.Disconnected) {
      wasConnectedRef.current = false;
      setPhase("preconnect");
    }
  }, [lk.connectionState]);

  const handleStartDemo = useCallback(() => {
    setPhase("joining");
    const roomName = `form-demo-${Math.random().toString(36).slice(2, 9)}`;
    void lk.connect(roomName).catch((err) => {
      console.error(err);
      setPhase("preconnect");
    });
  }, [lk]);

  const handleDisconnect = useCallback(() => {
    void lk.disconnect();
    setPhase("preconnect");
  }, [lk]);

  const showDemo = phase === "demo";

  return (
    <div className="flex h-[100dvh] w-full min-h-0 overflow-hidden bg-white">
      {showDemo ? (
        <>
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center text-[15px] leading-relaxed text-muted min-[950px]:hidden">
            <p className="m-0 max-w-[360px] text-foreground">
              Your screen is too small for this demo. 
            </p>
          </div>
          <div className="hidden h-full min-h-0 min-w-0 flex-1 min-[950px]:flex">
            <Landing />
            <AgentSidebar
              room={lk.room}
              connectionState={lk.connectionState}
              sidebar={lk.sidebar}
              avatarJoined={lk.avatarJoined}
              transcript={lk.transcript}
              interim={lk.interim}
              onDisconnect={handleDisconnect}
              sendUiEvent={lk.sendUiEvent}
              sendChat={lk.sendChat}
              micEnabled={lk.micEnabled}
              onToggleMicrophone={() => void lk.toggleMicrophone()}
            />
          </div>
          <div className="fixed bottom-3 left-3 right-3 z-50 hidden w-auto max-w-[min(280px,calc(100vw-1.5rem))] sm:right-auto min-[950px]:block">
            <PipelineHud pipeline={lk.pipeline} />
          </div>
        </>
      ) : (
        <PreConnectScreen onStart={handleStartDemo} isJoining={phase === "joining"} />
      )}
      {/* Remote agent TTS during connect (pre-demo) and in the demo — same pattern as lemonslice-examples. */}
      {lk.room ? <RoomAudioRenderer room={lk.room} /> : null}
    </div>
  );
}
