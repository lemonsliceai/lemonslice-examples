import {
  type JobContext,
  inference,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as lemonslice from "@livekit/agents-plugin-lemonslice";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Repo root = parent of `agent/` (same `.env.local` as Next.js)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });

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
  "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/inf2-image-uploads/image_9d0f6-WhaKqLKTzfVHlfe5jXzHE8Rpi9peF4.jpg";

const ASSISTANT_INSTRUCTIONS = `
You are Jess, an AI avatar powered by LemonSlice. 
You are powered by a cutting-edge pipeline of STT, LLM, TTS, and a diffusion transformer video model for the avatar. The user is speaking to you via a browser.

# Brevity.
# Looks.
You appear as a friendly young woman with black hair.

# Tech. The avatar model is a proprietary diffusion transformer video model that the LemonSlice team trained. The voice is powered by ElevenLabs. The text comes from an LLM. 

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
        model: "openai/gpt-4o-mini",
      }),
      stt: new inference.STT({
        model: "deepgram/nova-3",
        language: "en",
      }),

      // Public voice: Jessica — public default voice listed for LiveKit Inference (not custom/community).
      // Use the ElevenLabs plugin to set your own voice ID.
      // https://docs.livekit.io/agents/models/tts/inference/elevenlabs/#voices
      tts: new inference.TTS({
        model: "elevenlabs/eleven_turbo_v2_5",
        voice: "cgSgspJ2msm6clMCkdW9",
        language: "en",
      }),
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

    session.generateReply();
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
  }),
);
