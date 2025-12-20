import React, { useCallback } from "react";
import {
  useAudioTrack,
  useDaily,
  useLocalSessionId,
} from "@daily-co/daily-react";
import { Mic, MicOff, PhoneOff } from "lucide-react";

import Chat from "./Chat";

export default function Tray({ leaveCall }) {
  const callObject = useDaily();

  const localSessionId = useLocalSessionId();
  const localAudio = useAudioTrack(localSessionId);
  const mutedAudio = localAudio.isOff;

  const toggleAudio = useCallback(() => {
    callObject.setLocalAudio(mutedAudio);
  }, [callObject, mutedAudio]);

  return (
    <div
      className={`bg-dark-blue text-darkest-blue border-dark-blue-border fixed bottom-0
        left-0 flex w-full flex-col border-t`}
    >
      <Chat />
      <div className="flex p-4">
        <div className="flex flex-1 items-center justify-center gap-6">
          <button
            onClick={toggleAudio}
            type="button"
            className={`bg-turquoise hover:bg-turquoise-hover text-darkest-blue flex cursor-pointer flex-col 
              items-center rounded-lg px-4 py-2 font-normal transition-colors duration-200`}
          >
            {mutedAudio ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            <span className="text-xs">
              {mutedAudio ? "Unmute mic" : "Mute mic"}
            </span>
          </button>
          <button
            onClick={leaveCall}
            type="button"
            className={`bg-turquoise hover:bg-turquoise-hover text-darkest-blue flex cursor-pointer flex-col
              items-center rounded-lg px-4 py-2 font-normal transition-colors duration-200`}
          >
            <PhoneOff className="h-4 w-4" />
            <span className="text-xs">Leave call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
