import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  wavFileToPcm16Chunks,
  SEND_INTERVAL_MS,
  TARGET_SAMPLE_RATE,
} from "@/lib/wav";
import type { TunnelClient } from "@/lib/tunnel";

const SAMPLE_WAV_URL = "/sample.wav";

export function TunnelPanels({
  tunnelClient,
  tunnelReady,
}: {
  tunnelClient: TunnelClient | null;
  tunnelReady: boolean;
}) {
  const cancelSendRef = useRef(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [status, setStatus] = useState("");

  const onSendSample = useCallback(async () => {
    if (!tunnelClient || !tunnelReady) {
      setStatus("Tunnel not connected");
      return;
    }

    cancelSendRef.current = false;
    setSendingAudio(true);
    setStatus("Loading sample.wav…");
    try {
      const response = await fetch(SAMPLE_WAV_URL);
      if (!response.ok) throw new Error("Failed to load sample.wav");
      const blob = await response.blob();
      const { sampleRate, chunks } = await wavFileToPcm16Chunks(blob);

      setStatus(`Sending ${chunks.length} chunks…`);
      for (let i = 0; i < chunks.length; i++) {
        if (cancelSendRef.current) {
          setStatus("Send cancelled");
          return;
        }
        tunnelClient.sendAudioChunk(chunks[i], sampleRate);
        await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
      }
      if (!cancelSendRef.current) {
        tunnelClient.sendAudioEnd();
        setStatus("Sent sample.wav");
      }
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Failed to send WAV");
    } finally {
      setSendingAudio(false);
    }
  }, [tunnelClient, tunnelReady]);

  const onInterrupt = useCallback(() => {
    if (!tunnelClient || !tunnelReady) {
      setStatus("Tunnel not connected");
      return;
    }
    cancelSendRef.current = true;
    tunnelClient.sendInterrupt();
    setStatus("Interrupt sent");
  }, [tunnelClient, tunnelReady]);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4">
        <div>
          <p className="text-sm font-medium">Send WAV</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Stream <code className="text-foreground">sample.wav</code> as PCM{" "}
            {TARGET_SAMPLE_RATE} Hz over the tunnel WebSocket.
          </p>
        </div>
        <Button
          onClick={() => {
            void onSendSample();
          }}
          disabled={!tunnelReady || sendingAudio}
          className="w-full"
        >
          {sendingAudio ? (
            <>
              <Loader2 className="animate-spin" />
              Sending…
            </>
          ) : (
            "Send sample.wav"
          )}
        </Button>
      </div>

      <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4">
        <div>
          <p className="text-sm font-medium">Interrupt</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Send an <code className="text-foreground">interrupt</code> command
            to stop the current response.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onInterrupt}
          disabled={!tunnelReady}
          className="w-full"
        >
          Interrupt
        </Button>
      </div>

      {status ? (
        <p className="text-muted-foreground px-1 text-xs leading-relaxed">
          {status}
        </p>
      ) : null}
    </div>
  );
}
