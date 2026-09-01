import {
  type JobContext,
  inference,
  ServerOptions,
  cli,
  defineAgent,
  voice,
  waitForParticipant,
} from "@livekit/agents";
import * as lemonslice from "@livekit/agents-plugin-lemonslice";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Repo root = parent of `agent/` (same `.env.local` as Next.js)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

/**
 * Reference image for the LemonSlice avatar. Must be a full HTTP(S) URL that is
 * publicly reachable on the internet — LemonSlice’s servers fetch it. 
 * 
 * A site path (e.g. `/avatar.png`), a local file path, or `localhost` URLs their 
 * infra cannot reach will not work. 
 * 
 * Host the image on your app, blob storage, a CDN, etc.
 */

const AGENT_IMAGE_URL =
  "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/inf2-image-uploads/resized-image-MsYROR20dQfBG4KOLMe0pR7t34TSB0.jpg";
const AGENT_NAME = process.env.AGENT_NAME;
if (!AGENT_NAME) {
  throw new Error("Missing required env var: AGENT_NAME");
}

const ASSISTANT_INSTRUCTIONS = `
You are Jess, an AI avatar powered by LemonSlice.
You are powered by a cutting-edge diffusion transformer video model. The user is speaking to you via a browser.

# Looks.
You appear as a friendly young woman with black hair.

# Safety,
if the user gets inappropriate, steer the conversation back to acceptable topics.

Critical rule reminder. Three sentences or less.
`.trim();

class Assistant extends voice.Agent {
  constructor() {
    super({
      instructions: ASSISTANT_INSTRUCTIONS,
    });
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const session = new voice.AgentSession({
      llm: new inference.LLM({
        model: "google/gemma-4-31b-it",
      }),
      stt: new inference.STT({
        model: "deepgram/nova-3",
        language: "en",
      }),

      tts: "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      turnHandling: {
        interruption: {
          resumeFalseInterruption: true,
        },
      },
    });

    await ctx.connect();

    const avatar = new lemonslice.AvatarSession({
      agentImageUrl: AGENT_IMAGE_URL,
      agentPrompt: "A person talking.",
    });

    await avatar.start(session, ctx.room);

    await session.start({
      agent: new Assistant(),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
      outputOptions: {
        audioEnabled: false,
      },
    });

    // Wait for the LemonSlice avatar (AGENT participant) before the first reply.
    await waitForParticipant({
      room: ctx.room,
      identity: "lemonslice-avatar-agent",
    });
    session.generateReply();
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
