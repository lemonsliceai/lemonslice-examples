"""Pipes audio between the browser, ElevenLabs and LemonSlice."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import Enum

from lemonslice_bridge.audio import BRIDGE_SAMPLE_RATE
from lemonslice_bridge.elevenlabs import (
    AgentAudioChunk,
    ElevenLabsAgent,
    ElevenLabsCallbacks,
    ElevenLabsError,
)
from lemonslice_bridge.lemonslice import LemonSliceError, LemonSliceSession, LemonSliceTunnel

logger = logging.getLogger(__name__)

class InterruptSource(str, Enum):
    AGENT = "agent"
    USER = "user"


@dataclass
class _AudioItem:
    pcm16: bytes
    sample_rate: int
    epoch: int


@dataclass
class _EndOfResponseItem:
    epoch: int


Emit = Callable[[dict], Awaitable[None]]


class AudioBridge:
    """Owns one ElevenLabs conversation and one LemonSlice tunnel."""

    def __init__(self, session: LemonSliceSession, emit: Emit) -> None:
        self._session = session
        self._emit = emit

        self._queue: asyncio.Queue[_AudioItem | _EndOfResponseItem] = asyncio.Queue()
        self._sender_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

        self._agent: ElevenLabsAgent | None = None
        self._tunnel: LemonSliceTunnel | None = None

        self._epoch = 0
        self._response_open = False
        self._pending_playbacks = 0

    async def start(self) -> None:
        self._tunnel = LemonSliceTunnel(
            self._session.websocket_address,
            on_event=self._on_tunnel_event,
            on_message=self._on_tunnel_message,
        )
        await self._tunnel.connect()
        await self._emit({"type": "tunnel_connected"})

        self._agent = ElevenLabsAgent(
            ElevenLabsCallbacks(
                on_ready=self._on_agent_ready,
                on_audio=self._on_agent_audio,
                on_interruption=self._on_agent_interruption,
                on_agent_response=self._on_agent_response,
                on_user_transcript=self._on_user_transcript,
                on_closed=self._on_agent_closed,
            )
        )
        await self._agent.connect()

        self._sender_task = asyncio.create_task(self._sender_loop(), name="bridge-sender")

    async def aclose(self) -> None:
        if self._sender_task:
            self._sender_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sender_task
            self._sender_task = None

        if self._agent:
            await self._agent.aclose()
            self._agent = None

        if self._tunnel:
            with contextlib.suppress(LemonSliceError):
                await self._tunnel.send_terminate()
            await self._tunnel.aclose()
            self._tunnel = None

    async def send_user_audio(self, pcm16: bytes) -> None:
        if self._agent is None:
            return
        try:
            await self._agent.send_user_audio(pcm16)
        except ElevenLabsError:
            logger.warning("Dropping microphone audio: the agent socket is unavailable")

    async def send_user_message(self, text: str) -> None:
        if self._agent is not None:
            await self._agent.send_user_message(text)

    async def interrupt(self, source: InterruptSource = InterruptSource.USER) -> None:
        await self._interrupt(source)

    async def _on_agent_ready(self, conversation_id: str) -> None:
        agent = self._agent
        await self._emit(
            {
                "type": "conversation_ready",
                "conversation_id": conversation_id,
                "agent_output_format": str(agent.output_format) if agent else None,
                "user_input_format": str(agent.input_format) if agent else None,
            }
        )

    async def _on_agent_audio(self, chunk: AgentAudioChunk) -> None:
        async with self._lock:
            self._queue.put_nowait(
                _AudioItem(pcm16=chunk.pcm16, sample_rate=chunk.sample_rate, epoch=self._epoch)
            )

    async def _on_agent_response(self, text: str) -> None:
        # ElevenLabs streams a response's audio faster than realtime and sends
        # `agent_response` once the response is done, so this event doubles as
        # the end-of-response marker: everything queued ahead of this item is
        # that response's audio.
        async with self._lock:
            self._queue.put_nowait(_EndOfResponseItem(epoch=self._epoch))
        if text:
            await self._emit({"type": "agent_response", "text": text})

    async def _on_user_transcript(self, text: str) -> None:
        if text:
            await self._emit({"type": "user_transcript", "text": text})

    async def _on_agent_interruption(self, event_id: int) -> None:
        await self._interrupt(InterruptSource.AGENT, event_id=event_id)

    async def _on_agent_closed(self, reason: str) -> None:
        await self._emit({"type": "agent_closed", "reason": reason})

    async def _on_tunnel_event(self, event: dict) -> None:
        command = event.get("command")

        if command == "playback_finished":
            async with self._lock:
                self._pending_playbacks = max(0, self._pending_playbacks - 1)
                still_speaking = self._pending_playbacks > 0
            await self._emit(
                {
                    "type": "playback_finished",
                    "interrupted": bool(event.get("interrupted")),
                    "playback_position": event.get("playback_position"),
                }
            )
            if not still_speaking:
                await self._emit({"type": "avatar_state", "speaking": False})

        else:
            logger.debug("Unhandled tunnel event: %s", command)

    async def _on_tunnel_message(self, direction: str, message: dict) -> None:
        await self._emit(
            {
                "type": "tunnel_message",
                "direction": direction,
                "message": message,
            }
        )

    async def _interrupt(self, source: InterruptSource, *, event_id: int | None = None) -> None:
        async with self._lock:
            self._epoch += 1
            dropped = self._drain_queue()
            self._response_open = False
            should_signal = self._pending_playbacks > 0

        # Once LemonSlice has reported playback_finished there is nothing left
        # rendering to cut off, so the interrupt would be a no-op.
        if should_signal and self._tunnel is not None:
            await self._tunnel.send_interrupt()

        await self._emit(
            {
                "type": "interrupted",
                "source": source.value,
                "event_id": event_id,
                "dropped_chunks": dropped,
                "signalled": should_signal,
            }
        )

    def _drain_queue(self) -> int:
        dropped = 0
        while True:
            try:
                item = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            self._queue.task_done()
            if isinstance(item, _AudioItem):
                dropped += 1
        return dropped

    async def _sender_loop(self) -> None:
        while True:
            item = await self._queue.get()
            try:
                await self._forward(item)
            except Exception:
                logger.exception("Failed to forward audio to the LemonSlice tunnel")
            finally:
                self._queue.task_done()

    async def _forward(self, item: _AudioItem | _EndOfResponseItem) -> None:
        tunnel = self._tunnel
        if tunnel is None:
            return

        async with self._lock:
            if item.epoch != self._epoch:
                return

            if isinstance(item, _AudioItem):
                starting_response = not self._response_open
                if starting_response:
                    self._response_open = True
                    self._pending_playbacks += 1
            else:
                starting_response = False
                if not self._response_open:
                    return
                self._response_open = False

        if isinstance(item, _AudioItem):
            if starting_response:
                await self._emit({"type": "avatar_state", "speaking": True})
            await tunnel.send_audio(item.pcm16, item.sample_rate)
        else:
            # Without audio_end LemonSlice holds back the tail of the turn.
            await tunnel.send_audio_end()
            await self._emit({"type": "response_committed"})


__all__ = [
    "BRIDGE_SAMPLE_RATE",
    "AudioBridge",
    "InterruptSource",
]
