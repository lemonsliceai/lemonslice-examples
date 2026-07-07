import AgentCallUI from "@/components/AgentCallUI";

export default function Home() {
  if (!process.env.AGENT_IMAGE_URL?.trim()) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">
          Set <code className="font-mono">AGENT_IMAGE_URL</code> in{" "}
          <code className="font-mono">.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <AgentCallUI />
    </div>
  );
}
