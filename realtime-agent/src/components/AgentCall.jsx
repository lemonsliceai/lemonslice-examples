import React, { useEffect, useState } from "react";
import { useParticipantIds, useAppMessage } from "@daily-co/daily-react";

import AgentVideoTile from "./AgentVideoTile";
import { useAgentState } from "../providers/AgentStateProvider";

export default function AgentCall() {
  const remoteParticipantIds = useParticipantIds({ filter: "remote" });
  const sendAppMessage = useAppMessage();
  const [agentId, setAgentId] = useState(null);
  const { hasAgentJoinedRoom, isAgentReady } = useAgentState();

  /**
   * When the agent joins the call, send a default intro message
   * for the agent to respond to. The agent wont send downa/v until
   * it has a message to respond to.
   */
  useEffect(() => {
    if (remoteParticipantIds.length === 1 && hasAgentJoinedRoom) {
      sendAppMessage(
        {
          event: "chat-msg",
          message: "hello",
          name: "User",
        },
        "*",
      );
      setAgentId(remoteParticipantIds[0]);
    }
  }, [remoteParticipantIds.length, hasAgentJoinedRoom]);

  const renderCallScreen = () => (
    <div className="flex min-h-screen w-full items-start justify-center px-20 pb-20 pt-20">
      {/* Video of agent */}
      {agentId && hasAgentJoinedRoom && isAgentReady ? (
        <AgentVideoTile id={agentId} />
      ) : (
        // When the bot has not joined the call yet
        <div
          className={`bg-dark-blue text-grey-light box-border flex h-[560px] w-[368px] flex-col 
            items-center justify-center rounded-lg p-12 text-center shadow-lg`}
        >
          <h1 className="text-turquoise mb-2 text-2xl font-semibold">
            Waiting for agent
          </h1>
          <p className="text-grey mt-2 text-sm">
            The agent will join shortly...
          </p>
        </div>
      )}
    </div>
  );

  return renderCallScreen();
}
