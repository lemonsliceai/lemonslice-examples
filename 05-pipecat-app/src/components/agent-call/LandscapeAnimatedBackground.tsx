"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  width: number;
  alpha: number;
  hue: number;
};

function spawnStar(w: number, h: number, edge?: "left" | "right" | "top"): Star {
  const speed = 8 + Math.random() * 14;
  const angle =
    edge === "left"
      ? (-25 - Math.random() * 20) * (Math.PI / 180)
      : edge === "right"
        ? (-155 - Math.random() * 20) * (Math.PI / 180)
        : (70 + Math.random() * 40) * (Math.PI / 180);

  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  let x = Math.random() * w;
  let y = Math.random() * h;
  if (edge === "left") {
    x = -20;
    y = h * 0.55 + Math.random() * h * 0.5;
  } else if (edge === "right") {
    x = w + 20;
    y = h * 0.55 + Math.random() * h * 0.5;
  } else if (edge === "top") {
    x = Math.random() * w;
    y = -20;
  }

  return {
    x,
    y,
    vx,
    vy,
    len: 40 + Math.random() * 90,
    width: 1.5 + Math.random() * 2.5,
    alpha: 0.7 + Math.random() * 0.3,
    hue: Math.random() * 60 + 180,
  };
}

function drawStar(ctx: CanvasRenderingContext2D, s: Star) {
  const speed = Math.hypot(s.vx, s.vy) || 1;
  const tx = s.x - (s.vx / speed) * s.len;
  const ty = s.y - (s.vy / speed) * s.len;

  const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
  grad.addColorStop(0, `hsla(${s.hue}, 100%, 85%, ${s.alpha})`);
  grad.addColorStop(0.4, `hsla(${s.hue}, 90%, 70%, ${s.alpha * 0.6})`);
  grad.addColorStop(1, `hsla(${s.hue}, 80%, 60%, 0)`);

  ctx.strokeStyle = grad;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.fillStyle = `hsla(${s.hue}, 100%, 95%, ${s.alpha})`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.width * 1.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Canvas shooting stars — no external deps, full 16:9 background. */
export function LandscapeAnimatedBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      w = parent.clientWidth;
      h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    starsRef.current = Array.from({ length: 48 }, (_, i) =>
      spawnStar(w, h, i % 3 === 0 ? "left" : i % 3 === 1 ? "right" : "top"),
    );

    let frame = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);

      // Twinkling background stars
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 137.5) % w) + Math.sin(frame * 0.02 + i) * 2;
        const sy = ((i * 97.3) % h) + Math.cos(frame * 0.015 + i) * 2;
        const sa = 0.3 + 0.7 * Math.abs(Math.sin(frame * 0.04 + i * 1.7));
        ctx.fillStyle = `rgba(255,255,255,${sa * 0.8})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spawn new shooting stars frequently
      if (frame % 8 === 0) starsRef.current.push(spawnStar(w, h, "left"));
      if (frame % 10 === 0) starsRef.current.push(spawnStar(w, h, "right"));
      if (frame % 14 === 0) starsRef.current.push(spawnStar(w, h, "top"));

      starsRef.current = starsRef.current.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        const onScreen = s.x > -120 && s.x < w + 120 && s.y > -120 && s.y < h + 120;
        if (onScreen) drawStar(ctx, s);
        return onScreen;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={cn("absolute inset-0 z-0 overflow-hidden", className)} aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0c0033] via-[#120838] to-[#050014]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
