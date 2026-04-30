import { useEffect, useState } from "react";
import preview0 from "../assets/preview_0.png";
import preview1 from "../assets/preview_1.png";
import preview2 from "../assets/preview_2.png";
import { LemonSliceLogo } from "./LemonSliceLogo";

const PREVIEW_FRAMES = [preview0, preview1, preview2];

type Props = {
  onStart: () => void;
  /** Connecting to the room and waiting for the agent (`bot_ready`). */
  isJoining: boolean;
};

export function PreConnectScreen({ onStart, isJoining }: Props) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % PREVIEW_FRAMES.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const previewImage = PREVIEW_FRAMES[frameIndex];

  return (
    <main className="preconnect-screen-root flex h-[100dvh] w-full flex-col items-center gap-6 overflow-y-auto bg-white px-6 py-14">
      <div>
        <LemonSliceLogo forceShowText fill="#0a0a0a" scale={1.2} />
      </div>

      <section className="flex flex-col items-center gap-2 text-center text-accent">
        <h1 className="m-0 text-[44px] font-medium leading-none tracking-[-0.02em]">Form collection demo</h1>
        <p className="m-0 text-sm font-medium leading-5">
          This agent can dynamically fill out forms for you. Try asking the agent to schedule a demo.
        </p>
        <p className="text-sm font-medium leading-5 block min-[950px]:hidden">Your screen is too small for this demo. Please use a larger screen.</p>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={isJoining}
          aria-busy={isJoining}
          className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-accent px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-90 ${isJoining ? "" : "hidden min-[950px]:inline-flex"}`}
          onClick={onStart}
        >
          {isJoining ? (
            <>
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
              Connecting…
            </>
          ) : (
            "Enable microphone to continue"
          )}
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-[14px] bg-[#f5f5f5] px-4 text-sm font-medium text-accent no-underline"
        >
          View on GitHub
        </a>
      </div>

      <div className="mt-10 w-[900px] max-w-full shrink-0 overflow-hidden rounded-2xl border border-black/10">
        <img
          src={typeof previewImage === "string" ? previewImage : previewImage.src}
          alt="Product preview"
          className="block h-full w-full object-cover"
        />
      </div>
    </main>
  );
}
