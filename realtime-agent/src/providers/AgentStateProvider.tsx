import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface AgentStateContextType {
  hasAgentJoinedRoom: boolean;
  setHasAgentJoinedRoom: (hasAgentJoinedRoom: boolean) => void;
  isAgentReady: boolean;
  setIsAgentReady: (isAgentReady: boolean) => void;
}

const AgentStateContext = createContext<AgentStateContextType | undefined>(
  undefined,
);

interface AgentStateProviderProps {
  children: ReactNode;
}

export function AgentStateProvider({ children }: AgentStateProviderProps) {
  /**
   * The agent has joined the room but not a/v has been generated yet
   */
  const [hasAgentJoinedRoom, setHasAgentJoinedRoom] = useState<boolean>(false);
  /**
   * The agent is fully ready to be displayed
   */
  const [isAgentReady, setIsAgentReady] = useState<boolean>(false);

  return (
    <AgentStateContext.Provider
      value={{
        hasAgentJoinedRoom,
        setHasAgentJoinedRoom,
        isAgentReady,
        setIsAgentReady,
      }}
    >
      {children}
    </AgentStateContext.Provider>
  );
}

export function useAgentState(): AgentStateContextType {
  const context = useContext(AgentStateContext);
  if (!context) {
    throw new Error("useAgentState must be used within an AgentStateProvider");
  }
  return context;
}
