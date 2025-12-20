# Lemon Slice Realtime Agent

A React application that demonstrates how to integrate with the Lemon Slice Agent to create Daily.co video rooms and interact with AI agents in real-time.

## Overview

This application showcases how to:

- Create Daily.co rooms and integrate it with the Lemon Slice agent
- Join video calls with the agent
- Send messages to agents
- Listen to agent events and handle responses

## Prerequisites

- Node.js 18+ and pnpm
- A self hosted endpoint that calls the Lemon Slice API given your API Token
- A Lemon Slice agent ID

> **⚠️ Security Note:** Never expose your API token in client-side code. Always use a self-hosted endpoint to securely handle API calls with your token on the server side.

## Installation

```bash
# Install dependencies
pnpm install
```

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
VITE_API_ENDPOINT=https://your-api-endpoint.com
VITE_AGENT_ID=your_agent_id
```

## Creating a Room

The application creates a Daily.co room given the room_url returned by the Lemon Slice API. This is handled in `src/api.js`:

## Sending Messages to the Agent

Messages are sent to the agent using Daily's `sendAppMessage` function. This code lives in `src/components/Chat.jsx`. The message format is:

```javascript
sendAppMessage(
  {
    event: "chat-msg",
    message: "Your message here",
    name: "User",
  },
  "*", // Send to all participants
);
```

## Listening to Agent Events

The application listens to agent events using Daily's `useDailyEvent` hook with the `"app-message"` event type. Events are handled in `src/components/LemonSliceAgentApp.jsx`:

```javascript
useDailyEvent(
  "app-message",
  useCallback((ev) => {
    // Handle different event types
    if (ev?.data?.type === "bot_ready") {
      setIsAgentReady(true);
    }
    // ... other event handlers
  }, []),
);
```

## Sending Control Events

You can also send control events to the agent:

### Force End

Forcefully end the agent session:

```javascript
sendAppMessage({ event: "force-end" }, "*");
```

## Development

```bash
# Start development server
pnpm dev

# Format code
pnpm format

# Lint code
pnpm lint
```
