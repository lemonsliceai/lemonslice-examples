"use client";

import { Button } from "@/components/ui/button";
import { MicrophoneIcon, PhoneIcon } from "@heroicons/react/16/solid";
import MicrophoneSlashIcon from "@/components/MicrophoneSlashIcon";
import TextComposer from "@/components/TextComposer";

export function CallControlsBar({
  message,
  onMessageChange,
  onSendMessage,
  micEnabled,
  micPending,
  onToggleMic,
  onHangUp,
}: {
  message: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  micEnabled: boolean;
  micPending: boolean;
  onToggleMic: () => void;
  onHangUp: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-4 px-3 self-stretch mx-auto"
      style={{ width: "min(100%, 600px)", minWidth: 0 }}
    >
      <div className="flex items-center gap-2 w-full min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant={micEnabled ? "default" : "outline"}
            size="icon"
            className="h-11 w-11 rounded-full"
            disabled={micPending}
            onClick={onToggleMic}
            title={micEnabled ? "Mute" : "Unmute"}
          >
            {micEnabled ? (
              <MicrophoneIcon className="w-5 h-5" />
            ) : (
              <MicrophoneSlashIcon className="w-5 h-5 text-red-500" />
            )}
          </Button>
        </div>
        <div className="flex-1 min-w-0 w-0">
          <TextComposer
            value={message}
            onChange={onMessageChange}
            onSubmit={onSendMessage}
            placeholder="Message"
            maxLength={500}
          />
        </div>
        <Button
          onClick={onHangUp}
          variant="destructive"
          size="icon"
          className="h-11 w-11 rounded-full bg-red-500 flex-shrink-0"
          title="Hang up"
        >
          <PhoneIcon className="w-5 h-5 rotate-[135deg] translate-y-0.5" />
        </Button>
      </div>
    </div>
  );
}
