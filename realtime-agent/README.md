# Lemon Slice Realtime Agent

A React application that demonstrates how to integrate with the Lemon Slice API to create Daily.co video player and interact with AI agents in real-time.

## Overview

This application showcases how to:

- Securely connect to the Lemon Slice API
- Create Daily.co rooms and integrate it with a Lemon Slice agent
- Join video calls with the agent
- Send messages to agents
- Listen to Lemon Slice events and handle responses

## Prerequisites

- Node.js 18+ and pnpm
- Python 3.8+ and pip
- A Lemon Slice API key
- A Lemon Slice agent ID

> **⚠️ Security Note:** Never expose your API token in client-side code. Always use a self-hosted endpoint to securely handle API calls with your token on the server side.

## Installation

```bash
# Install frontend dependencies
pnpm install

# Install backend dependencies
pip install -r requirements.txt
```

## Environment Setup

Create a `.env` file based on `.env.example` in the root directory with the following variables:

```env
AGENT_ID=your_agent_id
API_KEY=your_api_key
```

## Start the servers

1. Start up the frontend and backend server concurrently
```bash
pnpm start
```
2. Navigate to `http://localhost:5173`

## Architecture

This application consists of two parts:

1. **Frontend (React)**: The user interface that connects to Daily.co and interacts with the agent
2. **Backend (FastAPI)**: A server that securely calls the Lemon Slice API to create rooms

## Creating a Room

The application creates a Daily.co room by calling the Lemon Slice API through the backend server. Here's how it works:

### Backend Server (`backend/server.py`)

The backend server provides a `/create-room` endpoint that securely calls the Lemon Slice API:

```python
@app.post("/create-room")
async def create_room():
    agent_id = os.getenv("AGENT_ID")
    api_key = os.getenv("API_KEY")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://lemonslice.com/api/rooms",
            headers={"X-API-Key": api_key},
            json={"agent_id": agent_id},
        )
        data = response.json()
        return {"room_url": data["room_url"]}
```

The server:
- Reads `AGENT_ID` and `API_KEY` from environment variables
- Makes a POST request to `https://lemonslice.com/api/rooms` with the API key in headers
- Returns the `room_url` from the Lemon Slice API response

### Frontend API Client (`src/api.js`)

The frontend calls the backend server to get the room URL:

```javascript
async function createRoom() {
  const endpoint = "http://localhost:3000/create-room";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return response.json(); // Returns { room_url: "..." }
}
```

This approach keeps your API key secure on the server side and never exposes it to the client.

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
