async function createRoom() {
  const endpoint = import.meta.env.VITE_API_ENDPOINT;
  const agentId = import.meta.env.VITE_AGENT_ID;

  if (!endpoint || !agentId) {
    throw new Error(
      "Missing required environment variables: VITE_API_ENDPOINT and VITE_AGENT_ID",
    );
  }

  const body = {
    agent_id: agentId,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (response.ok) {
    return response.json();
  } else {
    throw new Error("API request failed");
  }
}

export default { createRoom };
