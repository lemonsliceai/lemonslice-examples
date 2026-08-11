"""PCM16 / mu-law helpers for translating between ElevenLabs and LemonSlice.

ElevenLabs agents may be configured for any `pcm_*` rate or `ulaw_8000`; the
LemonSlice tunnel only speaks PCM16, so mu-law has to be decoded here.
"""

from __future__ import annotations

import array
import sys
from dataclasses import dataclass

BRIDGE_SAMPLE_RATE = 16000
_IS_BIG_ENDIAN = sys.byteorder == "big"
_MULAW_BIAS = 0x84
_MULAW_CLIP = 32635


def _build_mulaw_decode_table() -> tuple[int, ...]:
    table = []
    for byte in range(256):
        value = ~byte & 0xFF
        mantissa = value & 0x0F
        exponent = (value >> 4) & 0x07
        sign = value & 0x80
        magnitude = ((mantissa << 3) + _MULAW_BIAS) << exponent
        magnitude -= _MULAW_BIAS
        table.append(-magnitude if sign else magnitude)
    return tuple(table)


_MULAW_DECODE_TABLE = _build_mulaw_decode_table()

#: Maps the top bits of a biased magnitude to a G.711 mu-law segment.
_MULAW_EXPONENT_TABLE = tuple(
    [0] * 2 + [1] * 2 + [2] * 4 + [3] * 8 + [4] * 16 + [5] * 32 + [6] * 64 + [7] * 128
)


@dataclass(frozen=True)
class AudioFormat:
    encoding: str  # "pcm" | "ulaw"
    sample_rate: int

    @property
    def is_mulaw(self) -> bool:
        return self.encoding == "ulaw"


def parse_audio_format(raw: str | None, *, default_sample_rate: int = 16000) -> AudioFormat:
    if not raw:
        return AudioFormat("pcm", default_sample_rate)

    encoding, separator, rate = raw.partition("_")
    encoding = encoding.lower()
    if encoding not in ("pcm", "ulaw") or not separator:
        raise ValueError(f"Unsupported ElevenLabs audio format: {raw!r}")
    try:
        sample_rate = int(rate)
    except ValueError as exc:
        raise ValueError(f"Unsupported ElevenLabs audio format: {raw!r}") from exc
    if sample_rate <= 0:
        raise ValueError(f"Unsupported ElevenLabs audio format: {raw!r}")
    return AudioFormat(encoding, sample_rate)


def mulaw_to_pcm16(payload: bytes) -> bytes:
    samples = array.array("h", (_MULAW_DECODE_TABLE[byte] for byte in payload))
    _ensure_little_endian(samples)
    return samples.tobytes()


def pcm16_to_mulaw(payload: bytes) -> bytes:
    samples = _samples_from_pcm16(payload)
    encoded = bytearray(len(samples))
    for index, sample in enumerate(samples):
        sign = 0x80 if sample < 0 else 0x00
        magnitude = min(abs(sample), _MULAW_CLIP) + _MULAW_BIAS
        exponent = _MULAW_EXPONENT_TABLE[(magnitude >> 7) & 0xFF]
        mantissa = (magnitude >> (exponent + 3)) & 0x0F
        encoded[index] = ~(sign | (exponent << 4) | mantissa) & 0xFF
    return bytes(encoded)


def resample_pcm16(payload: bytes, from_rate: int, to_rate: int) -> bytes:
    """Linear-interpolation resampler for mono PCM16.

    Good enough for speech at the chunk sizes moved here, and it avoids pulling
    a native DSP dependency into the bridge.
    """
    if from_rate <= 0 or to_rate <= 0:
        raise ValueError("Sample rates must be positive")
    if from_rate == to_rate or not payload:
        return payload

    source = _samples_from_pcm16(payload)
    source_len = len(source)
    if source_len == 0:
        return b""
    if source_len == 1:
        return payload

    target_len = max(1, round(source_len * to_rate / from_rate))
    step = (source_len - 1) / max(1, target_len - 1) if target_len > 1 else 0.0
    resampled = array.array("h", bytes(2 * target_len))
    for index in range(target_len):
        position = index * step
        left = int(position)
        right = min(left + 1, source_len - 1)
        fraction = position - left
        value = source[left] + (source[right] - source[left]) * fraction
        resampled[index] = _clamp_pcm16(int(round(value)))

    _ensure_little_endian(resampled)
    return resampled.tobytes()


def pcm16_duration_ms(payload: bytes, sample_rate: int) -> float:
    if sample_rate <= 0:
        return 0.0
    return (len(payload) / 2) / sample_rate * 1000.0


def to_bridge_pcm16(payload: bytes, source_format: AudioFormat, target_rate: int) -> bytes:
    pcm = mulaw_to_pcm16(payload) if source_format.is_mulaw else payload
    return resample_pcm16(pcm, source_format.sample_rate, target_rate)


def from_bridge_pcm16(payload: bytes, source_rate: int, target_format: AudioFormat) -> bytes:
    pcm = resample_pcm16(payload, source_rate, target_format.sample_rate)
    return pcm16_to_mulaw(pcm) if target_format.is_mulaw else pcm


def _samples_from_pcm16(payload: bytes) -> array.array:
    usable = len(payload) - (len(payload) % 2)
    samples = array.array("h")
    samples.frombytes(payload[:usable])
    _ensure_little_endian(samples)
    return samples


def _ensure_little_endian(samples: array.array) -> None:
    if _IS_BIG_ENDIAN:
        samples.byteswap()


def _clamp_pcm16(value: int) -> int:
    return max(-32768, min(32767, value))
