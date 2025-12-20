import { useCallback, useState } from "react";
import { useAppMessage } from "@daily-co/daily-react";
import { Send } from "lucide-react";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");

  const sendAppMessage = useAppMessage();

  /**
   * Send a message to the agent using Daily's sendAppMessage
   * function. The agent will receive the message and respond
   * accordingly.
   */
  const sendMessage = useCallback(
    (message) => {
      sendAppMessage(
        {
          event: "chat-msg",
          message: message,
          name: "User",
        },
        "*",
      );

      setMessages([
        ...messages,
        {
          msg: message,
          name: "User",
        },
      ]);
    },
    [messages, sendAppMessage],
  );

  const handleChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // don't allow people to submit empty strings
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  return (
    <aside
      className={`bg-dark-blue border-dark-blue-border text-grey-light fixed bottom-[81px] right-0 
        top-0 flex w-[300px] flex-col justify-end overflow-y-auto border-l`}
    >
      <div className="border-dark-blue-border border-b px-4 py-3">
        <h2 className="text-turquoise m-0 text-lg font-semibold">Messages</h2>
      </div>
      <ul className="m-0 h-full space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <li key={`message-${index}`} className="list-none">
            <div className="flex flex-col gap-1">
              <span className="text-turquoise text-sm font-semibold">
                {message?.name}
              </span>
              <p className="text-grey-light m-0 text-left text-sm leading-relaxed">
                {message?.msg}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="p-4">
        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <input
            className={`text-darkest-blue ring-turquoise bg-grey-light flex-grow rounded-lg border-0
              px-3 py-2 text-sm outline-none ring-2`}
            type="text"
            placeholder="Message"
            value={inputValue}
            onChange={handleChange}
          />
          <button
            type="submit"
            className={`bg-turquoise hover:bg-turquoise-hover text-darkest-blue flex cursor-pointer
              items-center justify-center rounded-lg border-0 p-3 transition-colors duration-200`}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
