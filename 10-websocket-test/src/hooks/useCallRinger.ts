import { useEffect, useRef } from "react";

/** Single shared ringtone for the active call's connecting phase. */
export function useCallRinger(enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audioRef.current = null;
      }
    };

    if (!enabled) {
      stop();
      return;
    }

    const audio = new Audio("/sounds/ring.m4a");
    audio.volume = 0.5;
    audioRef.current = audio;

    const play = () => {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    };
    play();
    intervalRef.current = setInterval(play, 2000);

    return stop;
  }, [enabled]);
}
