import { DailyVideo } from "@daily-co/daily-react";

export default function AgentVideoTile({ id }) {
  return (
    <div className="relative h-[560px] w-[368px]">
      <DailyVideo sessionId={id} type="video" />
    </div>
  );
}
