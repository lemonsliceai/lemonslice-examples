async function createRoom() {
  const endpoint = "http://127.0.0.1:3000/create-room";
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (response.ok) {
    return response.json();
  } else {
    const errorText = await response.text();
    throw new Error(`API request failed: ${errorText}`);
  }
}

export default { createRoom };
