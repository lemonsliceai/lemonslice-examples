import React, { useEffect, useRef } from "react";
import DailyIframe from "@daily-co/daily-js";
import { DailyProvider } from "@daily-co/daily-react";

import { AgentStateProvider } from "./providers/AgentStateProvider";
import LemonSliceAgentApp from "./components/LemonSliceAgentApp";

export default function App() {
  const callObjectRef = useRef(null);

  /**
   * Create a barebones call object to use for the DailyProvider
   */
  if (!callObjectRef.current) {
    callObjectRef.current = DailyIframe.createCallObject({
      videoSource: false,
      audioSource: true,
    });
  }

  const callObject = callObjectRef.current;

  /**
   * Cleanup the call object when the component unmounts
   * This is important to prevent hanging calls
   */
  useEffect(() => {
    return () => {
      const callObj = callObjectRef.current;
      if (callObj) {
        try {
          // Leave any active calls first
          const meetingState = callObj.meetingState();
          if (
            meetingState === "joined-meeting" ||
            meetingState === "joining-meeting"
          ) {
            callObj.leave();
          }
        } catch (error) {
          console.error("Error leaving call object:", error);
        }

        // Destroy the call object
        try {
          callObj.destroy();
        } catch (error) {
          console.error("Error destroying call object:", error);
        } finally {
          callObjectRef.current = null;
        }
      }
    };
  }, []);

  const renderApp = () => {
    return (
      <DailyProvider callObject={callObject}>
        <AgentStateProvider>
          <LemonSliceAgentApp />
        </AgentStateProvider>
      </DailyProvider>
    );
  };

  return (
    <div className="bg-darkest-blue min-h-screen w-full">{renderApp()}</div>
  );
}
