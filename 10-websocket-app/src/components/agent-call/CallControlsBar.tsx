"use client";

import { MicrophoneIcon, PhoneIcon } from "@heroicons/react/16/solid";
import MicrophoneSlashIcon from "@/components/MicrophoneSlashIcon";
import TextComposer from "@/components/TextComposer";
import { Button } from "@/components/ui/button";

export function CallControlsBar({
  muted,
  micLevel,
  avatarSpeaking,
  message,
  onMessageChange,
  onSendMessage,
  onToggleMute,
  onInterrupt,
  onHangUp,
}: {
  muted: boolean;
  micLevel: number;
  avatarSpeaking: boolean;
  message: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onHangUp: () => void;
}) {
  return (
    <div
      className="mx-auto flex min-w-0 items-center gap-2 self-stretch px-3"
      style={{ width: "min(100%, 600px)" }}
    >
      <div className="relative flex-shrink-0">
        <Button
          onClick={onToggleMute}
          variant={muted ? "outline" : "default"}
          size="icon"
          className="h-11 w-11 rounded-full"
          title={muted ? "Unmute microphone" : "Mute microphone"}
        >
          {muted ? (
            <MicrophoneSlashIcon className="h-5 w-5 text-red-500" />
          ) : (
            <MicrophoneIcon className="h-5 w-5" />
          )}
        </Button>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-emerald-500 transition-opacity"
          style={{ opacity: muted ? 0 : Math.min(1, micLevel * 1.6) }}
        />
      </div>

      <div className="w-0 min-w-0 flex-1">
        <TextComposer
          value={message}
          onChange={onMessageChange}
          onSubmit={onSendMessage}
          placeholder="Message"
          maxLength={500}
        />
      </div>

      <Button
        onClick={onInterrupt}
        variant="outline"
        className="h-11 flex-shrink-0 rounded-full px-4"
        disabled={!avatarSpeaking}
        title="Cut off the avatar and clear queued audio"
      >
        Send interrupt
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
  );
}
