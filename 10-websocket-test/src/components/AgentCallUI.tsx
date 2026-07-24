import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { DailyCallView } from "@/components/agent-call/DailyCallView";
import { EgressSideMenu } from "@/components/agent-call/EgressSideMenu";
import { LiveKitCallView } from "@/components/agent-call/LiveKitCallView";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";
import { RingingShell } from "@/components/agent-call/RingingShell";
import { TunnelEventLog } from "@/components/agent-call/TunnelEventLog";
import { TunnelPanels } from "@/components/agent-call/TunnelPanels";
import {
  createSession,
  MissingApiKeyError,
  MissingDailyCredentialsError,
  MissingLiveKitCredentialsError,
  type EgressProvider,
  type SessionResponse,
} from "@/api";
import {
  createTunnelClient,
  type TunnelClient,
  type TunnelLogEntry,
} from "@/lib/tunnel";
import { useCallRinger } from "@/hooks/useCallRinger";

const DEFAULT_PLACEHOLDER_VIDEO = "/welcome.mp4";
const MAX_LOG_ENTRIES = 500;

export default function AgentCallUI({
  placeholderVideoUrl,
  className,
}: {
  placeholderVideoUrl?: string | null;
  className?: string;
}) {
  const [egress, setEgress] = useState<EgressProvider>("livekit");
  const [sessionActive, setSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBotReady, setIsBotReady] = useState(false);
  const [tunnelReady, setTunnelReady] = useState(false);
  const [tunnelClient, setTunnelClient] = useState<TunnelClient | null>(null);
  const [logEntries, setLogEntries] = useState<TunnelLogEntry[]>([]);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [hasBeenReady, setHasBeenReady] = useState(false);
  const tunnelClientRef = useRef<TunnelClient | null>(null);

  const appendLog = useCallback((entry: TunnelLogEntry) => {
    setLogEntries((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
    });
  }, []);

  const closeTunnel = useCallback((terminate: boolean) => {
    const client = tunnelClientRef.current;
    if (client) {
      if (terminate) client.sendTerminate();
      else client.close();
    }
    tunnelClientRef.current = null;
    setTunnelClient(null);
    setTunnelReady(false);
  }, []);

  const stopSession = useCallback(
    async (options?: { terminate?: boolean }) => {
      const shouldTerminate = options?.terminate ?? true;
      closeTunnel(shouldTerminate);
      setIsBotReady(false);
      setHasBeenReady(false);
      setSessionActive(false);
      setIsConnecting(false);
      setSession(null);
    },
    [closeTunnel],
  );

  useEffect(() => {
    if (isBotReady) setHasBeenReady(true);
  }, [isBotReady]);

  useCallRinger(sessionActive && !hasBeenReady);

  useEffect(() => {
    const terminate = () => {
      tunnelClientRef.current?.sendTerminate();
      tunnelClientRef.current = null;
    };
    window.addEventListener("pagehide", terminate);
    window.addEventListener("beforeunload", terminate);
    return () => {
      window.removeEventListener("pagehide", terminate);
      window.removeEventListener("beforeunload", terminate);
      terminate();
    };
  }, []);

  const handleStartCall = useCallback(async () => {
    if (isConnecting || sessionActive) return;
    setIsConnecting(true);
    setIsBotReady(false);
    setHasBeenReady(false);
    setLogEntries([]);
    setSessionActive(true);
    try {
      const created = await createSession(egress);
      const { websocket_address: websocketAddress } = created;

      if (!websocketAddress) {
        throw new Error("Sessions API response missing websocket_address");
      }
      if (egress === "daily" && (!created.room_url || !created.token)) {
        throw new Error("Daily session missing room_url or token");
      }
      if (
        egress === "livekit" &&
        (!created.livekit_url || !created.livekit_token)
      ) {
        throw new Error("LiveKit session missing livekit_url or livekit_token");
      }
      const tunnel = createTunnelClient(websocketAddress, { onLog: appendLog });
      tunnelClientRef.current = tunnel;
      setTunnelClient(tunnel);
      tunnel.on((event) => {
        if (event === "open") setTunnelReady(true);
        if (event === "close") setTunnelReady(false);
      });
      await tunnel.connect();
      setSession(created);
    } catch (error) {
      console.error(error);
      if (error instanceof MissingApiKeyError) {
        toast.error("Missing LEMONSLICE_API_KEY");
      } else if (error instanceof MissingDailyCredentialsError) {
        toast.error("Missing DAILY_API_KEY");
      } else if (error instanceof MissingLiveKitCredentialsError) {
        toast.error(
          "Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET",
        );
      } else {
        toast.error(
          error instanceof Error ? error.message : "Failed to start session",
        );
      }
      await stopSession({ terminate: false });
    } finally {
      setIsConnecting(false);
    }
  }, [appendLog, egress, isConnecting, sessionActive, stopSession]);

  const placeholderVideo = placeholderVideoUrl ?? DEFAULT_PLACEHOLDER_VIDEO;
  const showCallControls = Boolean(session && isBotReady);
  const handleHangUp = useCallback(() => {
    void stopSession({ terminate: true });
  }, [stopSession]);

  return (
    <div
      className={cn(
        "flex min-h-screen w-full items-center justify-center p-4",
        className,
      )}
    >
      <div className="flex w-full max-w-5xl flex-col items-center justify-center gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-col items-center gap-4">
          {!sessionActive ? (
            <PreJoinPreview
              placeholderVideo={placeholderVideo}
              onStartCall={() => {
                void handleStartCall();
              }}
              starting={isConnecting}
            />
          ) : session?.egress === "daily" &&
            session.room_url &&
            session.token ? (
            <DailyCallView
              roomUrl={session.room_url}
              token={session.token}
              placeholderVideo={placeholderVideo}
              onHangUp={handleHangUp}
              onReadyChange={setIsBotReady}
            />
          ) : session?.egress === "livekit" &&
            session.livekit_url &&
            session.livekit_token ? (
            <LiveKitCallView
              serverUrl={session.livekit_url}
              token={session.livekit_token}
              placeholderVideo={placeholderVideo}
              onHangUp={handleHangUp}
              onReadyChange={setIsBotReady}
            />
          ) : (
            <RingingShell
              placeholderVideo={placeholderVideo}
              onHangUp={handleHangUp}
            />
          )}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3 lg:w-80">
          {!sessionActive ? (
            <EgressSideMenu
              value={egress}
              onChange={setEgress}
              disabled={isConnecting}
            />
          ) : (
            <>
              {showCallControls && (
                <TunnelPanels
                  tunnelClient={tunnelClient}
                  tunnelReady={tunnelReady}
                />
              )}
              <TunnelEventLog entries={logEntries} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
