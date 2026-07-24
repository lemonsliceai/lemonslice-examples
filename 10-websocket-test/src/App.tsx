import { Toaster } from "react-hot-toast";
import AgentCallUI from "@/components/AgentCallUI";

export default function App() {
  return (
    <div className="bg-background min-h-screen w-full">
      <Toaster />
      <AgentCallUI />
    </div>
  );
}
