import React, { useCallback, useState, useEffect } from "react";
import {
  useDailyEvent,
  useDaily,
  DailyAudio,
  useAppMessage,
  useMeetingState,
} from "@daily-co/daily-react";

import api from "../api";
import { useAgentState } from "../providers/AgentStateProvider";
import HomeScreen from "./HomeScreen";
import AgentCall from "./AgentCall";
import Tray from "./Tray";

const STATE_IDLE = "STATE_IDLE";
const STATE_JOINING = "STATE_JOINING";
const STATE_JOINED = "STATE_JOINED";
const STATE_ERROR = "STATE_ERROR";

export default function LemonSliceAgentApp() {
  const callObject = useDaily();
  const sendAppMessage = useAppMessage();
  const meetingState = useMeetingState();
  const [appState, setAppState] = useState(STATE_IDLE);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState(false);
  const { setHasAgentJoinedRoom, setIsAgentReady } = useAgentState();

  /**
   * Handle when the agent leaves the call
   */
  useDailyEvent(
    "participant-left",
    useCallback(() => {
      setHasError(true);
      setErrorMessage("Agent left the call");
    }, []),
  );

  /*
   * Handle Daily webRTC Errors
   */
  useDailyEvent(
    "error",
    useCallback(() => {
      setHasError(true);
      setErrorMsg("An error occurred. Please try again.");
    }, []),
  );

  /**
   * Handle Lemon Slice specific events
   */
  useDailyEvent(
    "app-message",
    useCallback((ev) => {
      if (ev?.data?.type === "bot_ready") {
        setIsAgentReady(true);
      }
      if (ev?.data?.type === "idle_timeout") {
        hasError(true);
        setErrorMessage("Agent has hit idle timeout");
      }
      if (ev?.data?.type === "daily_error") {
        hasError(true);
        setErrorMessage(
          "A pipeline error occurred. " +
            ev?.data?.error +
            " fatal:" +
            ev?.data?.fatal?.toString(),
        );
      }
      if (ev?.data?.type === "video_generation_error") {
        hasError(true);
        setErrorMessage("A video generation error occurred.");
      }
    }, []),
  );

  /**
   * Reset state so a new call can be created
   */
  const resetDailyState = useCallback(() => {
    if (callObject) {
      try {
        const meetingState = callObject.meetingState();
        if (
          meetingState === "joined-meeting" ||
          meetingState === "joining-meeting"
        ) {
          // Force stop the Lemon Slice Agent instead of waiting for the idle timeout trigger
          sendAppMessage({ event: "force-end" }, "*");
        }
      } catch (error) {
        // If there is an error, we're not in a meeting, so skip sendAppMessage
      }
    }
    setIsAgentReady(false);
    setHasAgentJoinedRoom(false);
    setAppState(STATE_IDLE);
    setHasError(false);
  }, [setIsAgentReady, setHasAgentJoinedRoom]);

  /**
   * Reset state when the page is unloaded
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      resetDailyState();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      resetDailyState();
    };
  }, [resetDailyState]);

  /**
   * Call your API to create a Daily room
   * and then join that Daily room
   */
  const createCall = useCallback(() => {
    setAppState(STATE_JOINING);
    return api
      .createRoom()
      .then((room) => room.room_url)
      .then((url) => {
        return callObject
          .join({
            url: url,
            audioSource: true,
            videoSource: false,
            startAudioOff: true,
          })
          .then(() => {
            // Agent has joined the call but has not sent down a/v yet
            setHasAgentJoinedRoom(true);
          });
      })
      .catch((error) => {
        console.error("Error creating or joining room", error);
        setAppState(STATE_IDLE);
        setHasError(true);
        setErrorMessage("Error creating room");
      });
  }, [callObject]);

  /**
   * Leave the call and reset state
   */
  const leaveCall = useCallback(() => {
    resetDailyState();
    if (callObject && appState !== STATE_ERROR) {
      callObject.leave();
    }
  }, [callObject, appState]);

  /**
   * Update app state based on reported meeting state changes.
   */
  useEffect(() => {
    if (!meetingState) return;

    switch (meetingState) {
      case "joined-meeting":
        setAppState(STATE_JOINED);
        break;
      case "left-meeting":
        resetDailyState();
        break;
      case "error":
        setAppState(STATE_ERROR);
        setHasError(true);
        setErrorMessage("Daily call error");
        break;
      default:
        break;
    }
  }, [meetingState]);

  const showCall = !hasError && [STATE_JOINED, STATE_ERROR].includes(appState);

  const renderLemonSliceAgentApp = () => {
    // If something goes wrong with creating the room.
    if (hasError) {
      return (
        <div className="flex min-h-screen w-full items-center justify-center p-4">
          <div className="bg-dark-blue box-border flex w-full max-w-[480px] flex-col rounded-lg p-12 text-center shadow-lg">
            <h1 className="text-turquoise m-0 mb-4 p-0 text-2xl font-semibold">
              Notification
            </h1>
            <p className="text-grey-light mb-6 text-base">{errorMessage}</p>
            <Tray leaveCall={leaveCall} />
          </div>
        </div>
      );
    }

    if (showCall) {
      return (
        <>
          <AgentCall />
          <Tray leaveCall={leaveCall} />
          <DailyAudio />
        </>
      );
    } else {
      return (
        <HomeScreen
          createCall={createCall}
          creatingRoom={appState === STATE_JOINING}
        />
      );
    }
  };

  return renderLemonSliceAgentApp();
}
