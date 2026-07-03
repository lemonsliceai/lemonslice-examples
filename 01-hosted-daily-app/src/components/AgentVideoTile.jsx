import { DailyVideo } from "@daily-co/daily-react";

const VIDEO_WIDTH = 368;
const VIDEO_HEIGHT = 560;

export default function AgentVideoTile({ id }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}
    >
      <DailyVideo
        sessionId={id}
        type="video"
        fit="cover"
        className="block"
        style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}
      />
    </div>
  );
}
