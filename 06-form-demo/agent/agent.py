"""
LemonSlice form-demo agent: voice + tools + sidebar state sync.

Run:  cd agent && ../.venv/bin/python agent.py dev
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    function_tool,
    inference,
    room_io,
)
from livekit.agents.llm.chat_context import ChatMessage
from livekit.agents.metrics import LLMMetrics, TTSMetrics
from livekit.agents.voice import MetricsCollectedEvent
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.plugins import lemonslice, silero

import demo_room

load_dotenv()
logger = logging.getLogger("form-demo")
logging.basicConfig(level=logging.INFO)

# Must match token server `LIVEKIT_AGENT_NAME` — registers this worker for explicit agent dispatch.
LIVEKIT_AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "form-demo")

DEFAULT_AVATAR_IMAGE = os.getenv(
    "AVATAR_IMAGE_URL")


class FormDemoAgent(Agent):
    def __init__(self, room: rtc.Room) -> None:
        super().__init__(
            instructions="""You are Alex, an AI sales development rep for Acme Education.

Scheduling outcome: the demo they book is a scheduled live call with Matt, a human sales representative at Acme—not a bot-only session. When you discuss times or confirmation, speak naturally about meeting with Matt at that slot.

Product context (stay aligned with the landing page — reference naturally, never read it like a brochure):
- Acme Education is the operating layer for enterprise L&D: onboarding through compliance, for teams that cannot afford to slow down.
- Proof points you may cite when relevant: teams average ~40% faster onboarding; ~98% compliance audit pass rate among customers; 500+ enterprise customers worldwide.
- Pillars: (1) LMS integration — connects to Workday, SAP, and 40+ platforms; no rip-and-replace. (2) Live analytics — completion, skill gaps, ROI by team or role, updated in real time. (3) Compliance reports — audit-ready, auto-generated; helps avoid missed certification windows.
- Social proof: Stratos Group (VP People Ops Daniel G) reported cutting onboarding time by 40% in the first quarter and that analytics alone justified the cost.

Voice and style:
- Short, natural sentences (one or two per turn). No emojis or markdown.
- Sound consultative: match what they care about (onboarding speed, compliance, analytics, LMS sprawl) to the pillars above.
- Sidebar and calendar updates are instant in their app. Never say "one moment", "hang tight", or "I'll bring up the calendar" before a tool call. After opening scheduling, do not describe what's on screen ("you can see the calendar")—either ask when works for them in one short question or stay quiet if they're clearly choosing in the UI.

Goals in order:
1) Collect their work email. Ask them to spell it letter by letter (voice transcription is often wrong otherwise). Don't force them to spell it. After they spell it, repeat it back once to confirm, then call save_email with the corrected spelling (must look like a real work email). If something sounds ambiguous (B vs D, M vs N), ask briefly.
2) Only after work email is saved, call show_calendar once to reveal scheduling in the sidebar—call it without announcing it first. Do not call show_calendar before email is collected.
3) Help choose a time for their session with Matt; call select_slot when they pick a date/time by voice. If they use the calendar in the UI, their selection appears automatically — do not narrate it or tell them to tap Confirm unless they seem stuck.
4) When they confirm the booking by voice, call confirm_booking, then call end_call. After confirming, you may briefly mention Matt will join them at that time (keep it short).

If a UI hint says they used the calendar, trust those values."""
        )
        self._room = room
        self.demo = demo_room.DemoState()

    async def _sync_state(self) -> None:
        await demo_room.publish_json(self._room, self.demo.to_payload())

    @function_tool
    async def save_email(self, context: RunContext, email: str) -> tuple[None, str]:
        """Save the visitor's work email. Prefer the spelling they gave letter-by-letter over raw STT."""
        self.demo.email = email.strip()
        await self._sync_state()
        return None, "Saved."

    @function_tool
    async def show_calendar(self, context: RunContext) -> tuple[None, str]:
        """Reveal the scheduling calendar in the sidebar. Call only after work email is saved (via save_email). Call without prefacing—the UI updates immediately."""
        d = self.demo
        if not d.email:
            return (
                None,
                "Cannot show calendar yet — collect work email first.",
            )
        self.demo.stage = "schedule"
        await self._sync_state()
        return (
            None,
            "Calendar is open. Do not say it appeared or tell them to look at it; at most ask when works for them in one short question.",
        )

    @function_tool
    async def select_slot(self, context: RunContext, date_iso: str, slot_label: str) -> tuple[None, str]:
        """Save chosen slot: date_iso YYYY-MM-DD, slot_label like '1:00 pm'."""
        self.demo.selected_date = date_iso.strip()
        self.demo.selected_slot = slot_label.strip()
        await self._sync_state()
        return None, "Slot saved."

    @function_tool
    async def confirm_booking(self, context: RunContext) -> tuple[None, str]:
        """Mark the meeting confirmed."""
        self.demo.confirmed = True
        self.demo.stage = "done"
        await self._sync_state()
        return None, "Confirmed."

    @function_tool
    async def end_call(self, context: RunContext, delay_ms: int = 1200) -> tuple[None, str]:
        """End the call after wrap-up. Optional delay_ms lets final TTS finish before disconnect."""
        # Ensure the UI stays in a completed state even if this tool is called without confirm_booking.
        self.demo.confirmed = True
        self.demo.stage = "done"
        await self._sync_state()
        clamped_delay = max(0, min(int(delay_ms), 10_000))
        if clamped_delay:
            await asyncio.sleep(clamped_delay / 1000.0)
        await self._room.disconnect()
        return None, "Call ended."


def _gap_stt_to_llm_ms(transcription_delay_s: float) -> int:
    """Stagger STT vs LLM bar starts: preemptive LLM often begins before STT ‘completes’ (overlap)."""
    if transcription_delay_s <= 0:
        return 20
    td_ms = transcription_delay_s * 1000.0
    # Cap offset so LLM start sits inside the STT bar when possible (Gantt overlap).
    return max(8, min(int(transcription_delay_s * 1000.0 * 0.35), int(td_ms - 1)))


def _metrics_payload(
    msg: ChatMessage, turn_durations_s: dict[str, float]
) -> dict[str, Any] | None:
    """Publish per-turn Gantt data: bar lengths from collected model durations; stagger from TTFB/TTFT fields."""
    role = msg.role
    m: dict[str, Any] = msg.metrics if isinstance(msg.metrics, dict) else {}
    out: dict[str, Any] = {"type": "metrics"}
    if role == "user":
        td = m.get("transcription_delay")
        if td is not None:
            td_f = float(td)
            out["stt_ms"] = int(td_f * 1000)
            out["gap_llm_ms"] = _gap_stt_to_llm_ms(td_f)
    elif role == "assistant":
        llm_ttft = m.get("llm_node_ttft")
        tts_ttfb = m.get("tts_node_ttfb")
        llm_s = turn_durations_s.get("llm", 0.0)
        tts_s = turn_durations_s.get("tts", 0.0)
        if llm_s > 0:
            out["llm_ms"] = int(llm_s * 1000)
        elif llm_ttft is not None:
            out["llm_ms"] = max(1, int(float(llm_ttft) * 1000 * 2))
        if tts_s > 0:
            out["tts_ms"] = int(tts_s * 1000)
        elif tts_ttfb is not None:
            out["tts_ms"] = max(1, int(float(tts_ttfb) * 1000 * 3))
        if llm_ttft is not None:
            out["gap_tts_ms"] = int(float(llm_ttft) * 1000)
        if tts_ttfb is not None:
            out["gap_video_ms"] = int(float(tts_ttfb) * 1000)
    return out if len(out) > 1 else None


server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


async def _wait_avatar_ready(session_id: str, max_seconds: int = 300) -> bool:
    key = os.getenv("LEMONSLICE_API_KEY")
    if not key:
        logger.warning("LEMONSLICE_API_KEY missing; skipping avatar readiness poll")
        return True
    async with httpx.AsyncClient() as client:
        for _ in range(max_seconds):
            try:
                r = await client.get(
                    f"https://lemonslice.com/api/liveai/sessions/{session_id}",
                    headers={"X-API-Key": key},
                    timeout=10.0,
                )
                r.raise_for_status()
                data = r.json()
                status = data.get("session_status", "")
                if status == "ACTIVE":
                    return True
                if status in ("COMPLETED", "TIMED_OUT", "FAILED"):
                    return False
            except httpx.HTTPError as e:
                logger.warning("avatar poll: %s", e)
            await asyncio.sleep(1)
    return False


@server.rtc_session(agent_name=LIVEKIT_AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    await ctx.connect()

    demo_room.register_avatar_disconnect_handler(ctx.room)

    session = AgentSession(
        stt=inference.STT(
            model="deepgram/nova-2",
            extra_kwargs={"interim_results": False},
        ),
        llm="openai/gpt-4o-mini",
        tts="cartesia/sonic-3",
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    avatar = lemonslice.AvatarSession(
        agent_image_url=DEFAULT_AVATAR_IMAGE,
        agent_prompt="a professional sales development representative on a video call",
        response_done_timeout=0.6,
        idle_timeout=300,
        simulcast=True,
        aspect_ratio="3x2",
    )

    agent = FormDemoAgent(ctx.room)

    # Sum LiveKit LLM/TTS request durations per user→assistant turn for Gantt bar lengths.
    turn_durations_s = {"llm": 0.0, "tts": 0.0}

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent) -> None:
        m = ev.metrics
        if isinstance(m, LLMMetrics):
            turn_durations_s["llm"] += m.duration
        elif isinstance(m, TTSMetrics):
            dur = m.audio_duration if m.audio_duration > 0 else m.duration
            turn_durations_s["tts"] += dur

    @session.on("conversation_item_added")
    def _on_item(ev: ConversationItemAddedEvent) -> None:
        if not isinstance(ev.item, ChatMessage):
            return
        msg = ev.item
        # Assistant transcript: RoomIO publishes streamed agent text via LiveKit transcription
        # (see RoomOptions text_output sync_transcription); avoid duplicating on the demo channel.
        payload = _metrics_payload(msg, turn_durations_s)
        if payload:
            asyncio.create_task(demo_room.publish_json(ctx.room, payload))
        # Reset summed LLM/TTS durations after each assistant turn (do not clear on user — preemptive
        # generation may emit metrics before the user ChatMessage is committed).
        if msg.role == "assistant":
            turn_durations_s["llm"] = 0.0
            turn_durations_s["tts"] = 0.0

    async def handle_data(packet: rtc.DataPacket) -> None:
        if packet.topic != demo_room.DEMO_TOPIC:
            return
        try:
            msg = json.loads(packet.data.decode("utf-8"))
        except json.JSONDecodeError:
            return
        if msg.get("type") != "ui_event":
            return
        event = msg.get("event")
        if event == "slot_selected":
            agent.demo.selected_date = msg.get("date")
            agent.demo.selected_slot = msg.get("slot")
            agent.demo.ui_hint = (
                f"User picked {agent.demo.selected_slot} on {agent.demo.selected_date} in the UI."
            )
            await demo_room.publish_json(ctx.room, agent.demo.to_payload())
        elif event == "confirm_clicked":
            agent.demo.ui_hint = "User tapped Confirm in the UI."
            await demo_room.publish_json(ctx.room, agent.demo.to_payload())
            speech = session.generate_reply(
                instructions=(
                    "The user tapped Confirm to finalize their demo booking with Matt (human rep). "
                    "Say one short warm sentence that they're set and will get the calendar invite for that session with Matt. "
                    "Do not call any tools."
                ),
                tool_choice="none",
            )
            await speech.wait_for_playout()
            agent.demo.confirmed = True
            agent.demo.stage = "done"
            await demo_room.publish_json(ctx.room, agent.demo.to_payload())
            await asyncio.sleep(1.2)
            await ctx.room.disconnect()

    def _on_data_received(packet: rtc.DataPacket) -> None:
        asyncio.create_task(handle_data(packet))

    ctx.room.on("data_received", _on_data_received)

    session_id = await avatar.start(session, room=ctx.room)

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            # Default sync delays agent transcription to track TTS playout; disable so text follows the LLM stream.
            text_output=room_io.TextOutputOptions(sync_transcription=False),
        ),
    )

    ready = await _wait_avatar_ready(session_id)
    if not ready:
        logger.warning("Avatar did not become active in time")

    await session.generate_reply(
        instructions=(
            "Greet briefly as Alex the AI SDR. Mention you're here to help them schedule a demo with Matt "
            "(human rep) if it fits naturally in one short opener; otherwise ask how you can help."
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
