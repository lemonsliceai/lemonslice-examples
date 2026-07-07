"use client";

import { useEffect, useRef } from "react";
import type { VideoTrack } from "livekit-client";
import { cn } from "@/lib/utils";
import { CHROMA_KEY_OPTIONS } from "@/lib/constants";
import { createChromaKeyRenderer } from "@/lib/chroma-key/createChromaKeyRenderer";

type ChromaKeyVideoProps = {
  track: VideoTrack | null;
  className?: string;
};

export function ChromaKeyVideo({ track, className }: ChromaKeyVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container || !track) return;

    let renderer: ReturnType<typeof createChromaKeyRenderer> | null = null;
    let ro: ResizeObserver | null = null;
    let started = false;

    track.attach(video);
    video.playsInline = true;
    video.muted = true;

    const startRenderer = () => {
      if (started) return;
      started = true;
      try {
        renderer = createChromaKeyRenderer(canvas, CHROMA_KEY_OPTIONS);
      } catch (err) {
        console.error("Chroma key init failed:", err);
        return;
      }

      const syncSize = () => {
        const { width, height } = container.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;
        renderer?.resize(width, height);
        // Resize clears the canvas backing store; redraw immediately so the
        // avatar does not vanish for a frame while we wait for the next RAF tick.
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          renderer?.render(video);
        }
      };

      syncSize();
      ro = new ResizeObserver(syncSize);
      ro.observe(container);

      const tick = () => {
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          renderer?.render(video);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const onReady = () => startRenderer();
    video.addEventListener("loadeddata", onReady);
    void video.play().then(onReady).catch(onReady);

    return () => {
      video.removeEventListener("loadeddata", onReady);
      ro?.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      renderer?.destroy();
      track.detach(video);
    };
  }, [track]);

  if (!track) return null;

  return (
    <div ref={containerRef} className={cn("absolute inset-0 z-10", className)}>
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="h-full w-full bg-transparent" />
    </div>
  );
}
