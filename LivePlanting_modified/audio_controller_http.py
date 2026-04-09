# audio_controller_http.py
# Headless LivePlanting controller
# - A = start listening pulse only
# - B = stop everything + clear ambience
# - C = toggle ambience on/off (OFF also clears ambience)
# - D = toggle sync output pair on/off
# - E = start/stop recording to Downloads
# - Q = quit
# - riceve sync da SolarSynth via websocket broker
# - pulse su 5 ottave
# - ambience su 3 ottave
# - ambience generata come nel controller originale:
#   raccoglie humidity valida, se la streak si interrompe resetta,
#   dopo 20s fa la media e genera una nota ambience

import asyncio
import json
import math
import random
import select
import sys
import threading
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import sounddevice as sd
import serial
import websockets

WS_URI = "ws://127.0.0.1:8765"

SERIAL_PORT = "COM10"
SERIAL_BAUDRATE = 9600

SAMPLE_RATE = 48000
BLOCK_SIZE = 1024

PULSE_OUTPUT_DEVICE = None
AMBIENT_OUTPUT_DEVICE = None
SYNC_PULSE_OUTPUT_DEVICE = None
SYNC_AMBIENT_OUTPUT_DEVICE = None

HUMIDITY_WINDOW_SECONDS = 20.0
HUMIDITY_MIN = 200.0
HUMIDITY_MAX = 400.0
SYNC_FRESHNESS_SECONDS = 2.0

_state_lock = threading.Lock()
state_flags = {
    "pulse_enabled": False,
    "ambient_enabled": False,
    "sync_output_enabled": False,
}

sync_state = {
    "scale": "major",
    "key": 0,
    "reverb": 0.0,
    "distortion": 0.0,
    "delay": 0.0,
    "chorus": 0.0,
    "last_update": 0.0,
}
sync_lock = threading.Lock()


BASE_SCALE = "major"
BASE_KEY_PC = 0


def set_pulse_enabled(value: bool):
    with _state_lock:
        state_flags["pulse_enabled"] = bool(value)


def is_pulse_enabled() -> bool:
    with _state_lock:
        return bool(state_flags["pulse_enabled"])


def set_ambient_enabled(value: bool):
    with _state_lock:
        state_flags["ambient_enabled"] = bool(value)


def is_ambient_enabled() -> bool:
    with _state_lock:
        return bool(state_flags["ambient_enabled"])


def set_sync_output_enabled(value: bool):
    with _state_lock:
        state_flags["sync_output_enabled"] = bool(value)


def is_sync_output_enabled() -> bool:
    with _state_lock:
        return bool(state_flags["sync_output_enabled"])


def clamp01(x) -> float:
    try:
        x = float(x)
    except Exception:
        x = 0.0
    return max(0.0, min(1.0, x))


def normalize_scale_name(name: str) -> str:
    if not name:
        return "major"
    s = str(name).strip().lower()
    aliases = {
        "ionian": "major",
        "maj": "major",
        "aeolian": "minor",
        "natural minor": "minor",
        "naturalminor": "minor",
        "minor": "minor",
        "min": "minor",
        "major pentatonic": "pentatonic_major",
        "majorpentatonic": "pentatonic_major",
        "pentatonic major": "pentatonic_major",
        "minor pentatonic": "pentatonic_minor",
        "minorpentatonic": "pentatonic_minor",
        "pentatonic minor": "pentatonic_minor",
        "no scale": "chromatic",
        "none": "chromatic",
        "custom": "chromatic",
    }
    return aliases.get(s, s)


SCALE_OFFSETS: Dict[str, List[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "locrian": [0, 1, 3, 5, 6, 8, 10],
    "pentatonic_major": [0, 2, 4, 7, 9],
    "pentatonic_minor": [0, 3, 5, 7, 10],
    "chromatic": list(range(12)),
}


def is_sync_linked() -> bool:
    with sync_lock:
        return (time.time() - float(sync_state.get("last_update", 0.0))) <= SYNC_FRESHNESS_SECONDS


def get_scale_offsets(sync_variant: bool) -> List[int]:
    if sync_variant:
        with sync_lock:
            scale_name = normalize_scale_name(sync_state["scale"])
        return SCALE_OFFSETS.get(scale_name, SCALE_OFFSETS["major"])
    return SCALE_OFFSETS.get(BASE_SCALE, SCALE_OFFSETS["major"])


def get_fx_params(sync_variant: bool) -> Tuple[float, float, float, float]:
    if not sync_variant:
        return 0.0, 0.0, 0.0, 0.0
    with sync_lock:
        return (
            float(sync_state["reverb"]),
            float(sync_state["distortion"]),
            float(sync_state["delay"]),
            float(sync_state.get("chorus", 0.0)),
        )


def get_active_key_pc(sync_variant: bool) -> int:
    if sync_variant:
        with sync_lock:
            try:
                return int(sync_state.get("key", 0)) % 12
            except Exception:
                return 0
    return BASE_KEY_PC


def get_pulse_root_midi(sync_variant: bool) -> int:
    return 24 + get_active_key_pc(sync_variant)


def get_ambient_root_midi(sync_variant: bool) -> int:
    return 36 + get_active_key_pc(sync_variant)


def midi_to_freq(midi_note: float) -> float:
    return 440.0 * (2.0 ** ((midi_note - 69.0) / 12.0))


def build_scale_offsets_over_octaves(scale_offsets: List[int], max_semitones: int) -> List[int]:
    values = []
    max_octaves = (max_semitones // 12) + 2
    for octave in range(max_octaves):
        for offset in scale_offsets:
            v = octave * 12 + offset
            if v <= max_semitones:
                values.append(v)
    return sorted(set(values))


def quantize_to_scale(semitones: int, max_semitones: int, scale_offsets: List[int]) -> int:
    semitones = max(0, min(max_semitones, int(semitones)))
    allowed = build_scale_offsets_over_octaves(scale_offsets, max_semitones)
    return min(allowed, key=lambda x: abs(x - semitones))


def adc_to_note(adc: int, root_midi: int = 36, max_semitones: int = 60, scale_offsets: Optional[List[int]] = None) -> int:
    adc = max(0, min(1023, int(adc)))
    semitones = int(round((adc / 1023.0) * max_semitones))
    q = quantize_to_scale(semitones, max_semitones, scale_offsets or get_scale_offsets(False))
    return root_midi + q


def humidity_to_note(
    humidity: float,
    root_midi: int = 36,
    h_min: float = 200.0,
    h_max: float = 400.0,
    max_semitones: int = 36,
    scale_offsets: Optional[List[int]] = None,
) -> int:
    if humidity <= h_min:
        semitones = 0
    elif humidity >= h_max:
        semitones = max_semitones
    else:
        x = (humidity - h_min) / (h_max - h_min)
        semitones = int(round(x * max_semitones))
    q = quantize_to_scale(semitones, max_semitones, scale_offsets or get_scale_offsets(False))
    return root_midi + q


def softclip(signal: np.ndarray, amount: float) -> np.ndarray:
    amount = clamp01(amount)
    gain = 1.0 + amount * 10.0
    return np.tanh(signal * gain).astype(np.float32)


class CombFilter:
    def __init__(self, delay_samples: int, feedback: float):
        self.buffer = np.zeros(max(1, delay_samples), dtype=np.float32)
        self.index = 0
        self.feedback = feedback

    def process(self, x: np.ndarray) -> np.ndarray:
        y = np.empty_like(x)
        n = len(self.buffer)
        for i in range(len(x)):
            out = self.buffer[self.index]
            self.buffer[self.index] = x[i] + self.feedback * out
            y[i] = out
            self.index += 1
            if self.index >= n:
                self.index = 0
        return y


class AllpassFilter:
    def __init__(self, delay_samples: int, gain: float):
        self.buffer = np.zeros(max(1, delay_samples), dtype=np.float32)
        self.index = 0
        self.gain = gain

    def process(self, x: np.ndarray) -> np.ndarray:
        y = np.empty_like(x)
        n = len(self.buffer)
        for i in range(len(x)):
            delayed = self.buffer[self.index]
            inp = x[i]
            out = -self.gain * inp + delayed
            self.buffer[self.index] = inp + self.gain * out
            y[i] = out
            self.index += 1
            if self.index >= n:
                self.index = 0
        return y


class StereoReverb:
    def __init__(self, sr: int):
        def ms(v):
            return max(1, int(sr * v / 1000.0))

        self.comb_l = [CombFilter(ms(v), 0.77) for v in (29.7, 37.1, 41.1, 43.7)]
        self.comb_r = [CombFilter(ms(v), 0.77) for v in (30.7, 38.1, 42.1, 44.7)]
        self.ap_l = [AllpassFilter(ms(v), 0.70) for v in (5.0, 1.7)]
        self.ap_r = [AllpassFilter(ms(v), 0.70) for v in (5.3, 1.9)]

    def process(self, left: np.ndarray, right: np.ndarray, wet: float) -> Tuple[np.ndarray, np.ndarray]:
        wet = clamp01(wet)
        if wet <= 0.0001:
            return left, right

        yl = np.zeros_like(left)
        yr = np.zeros_like(right)

        for f in self.comb_l:
            yl += f.process(left)
        for f in self.comb_r:
            yr += f.process(right)

        yl *= 1.0 / len(self.comb_l)
        yr *= 1.0 / len(self.comb_r)

        for f in self.ap_l:
            yl = f.process(yl)
        for f in self.ap_r:
            yr = f.process(yr)

        dry = 1.0 - 0.6 * wet
        out_l = dry * left + wet * yl
        out_r = dry * right + wet * yr
        return out_l.astype(np.float32), out_r.astype(np.float32)


class StereoDelay:
    def __init__(self, sr: int, max_delay_s: float = 1.2):
        self.sr = sr
        self.size = int(sr * max_delay_s)
        self.buffer_l = np.zeros(self.size, dtype=np.float32)
        self.buffer_r = np.zeros(self.size, dtype=np.float32)
        self.index = 0

    def process(self, left: np.ndarray, right: np.ndarray, amount: float) -> Tuple[np.ndarray, np.ndarray]:
        amount = clamp01(amount)
        if amount <= 0.0001:
            return left, right

        delay_samples = int((0.18 + 0.42 * amount) * self.sr)
        delay_samples = min(delay_samples, self.size - 1)
        feedback = 0.15 + 0.45 * amount
        wet = 0.10 + 0.35 * amount

        out_l = np.copy(left)
        out_r = np.copy(right)

        for i in range(len(left)):
            read_idx = (self.index - delay_samples) % self.size
            dl = self.buffer_l[read_idx]
            dr = self.buffer_r[read_idx]

            self.buffer_l[self.index] = left[i] + feedback * dl
            self.buffer_r[self.index] = right[i] + feedback * dr

            out_l[i] = left[i] + wet * dl
            out_r[i] = right[i] + wet * dr

            self.index += 1
            if self.index >= self.size:
                self.index = 0

        return out_l.astype(np.float32), out_r.astype(np.float32)


class OnePoleLowpass:
    def __init__(self, sr: int, cutoff_hz: float):
        self.sr = sr
        self.z = 0.0
        self.set_cutoff(cutoff_hz)

    def set_cutoff(self, cutoff_hz: float):
        cutoff_hz = max(80.0, min(self.sr * 0.45, float(cutoff_hz)))
        x = math.exp(-2.0 * math.pi * cutoff_hz / self.sr)
        self.a = 1.0 - x
        self.b = x

    def process(self, x: np.ndarray) -> np.ndarray:
        y = np.empty_like(x)
        z = self.z
        a = self.a
        b = self.b
        for i, sample in enumerate(x):
            z = a * float(sample) + b * z
            y[i] = z
        self.z = z
        return y


class StereoChorus:
    def __init__(self, sr: int, max_delay_ms: float = 32.0):
        self.sr = sr
        self.size = max(4, int(sr * max_delay_ms / 1000.0) + 4)
        self.buffer_l = np.zeros(self.size, dtype=np.float32)
        self.buffer_r = np.zeros(self.size, dtype=np.float32)
        self.index = 0
        self.phase = 0.0

    def _read_interp(self, buffer: np.ndarray, delay_samples: float) -> float:
        read_pos = (self.index - delay_samples) % self.size
        i0 = int(read_pos)
        i1 = (i0 + 1) % self.size
        frac = read_pos - i0
        return float(buffer[i0] * (1.0 - frac) + buffer[i1] * frac)

    def process(self, left: np.ndarray, right: np.ndarray, amount: float) -> Tuple[np.ndarray, np.ndarray]:
        amount = clamp01(amount)
        if amount <= 0.0001:
            return left, right

        rate_hz = 0.10 + 1.65 * amount
        depth_ms = 1.5 + 8.5 * amount
        base_ms = 8.0 + 5.0 * amount
        wet = 0.08 + 0.30 * amount

        out_l = np.copy(left)
        out_r = np.copy(right)

        for i in range(len(left)):
            lfo_l = 0.5 * (1.0 + math.sin(2.0 * math.pi * self.phase))
            lfo_r = 0.5 * (1.0 + math.sin(2.0 * math.pi * (self.phase + 0.25)))
            delay_l = (base_ms + depth_ms * lfo_l) * self.sr / 1000.0
            delay_r = (base_ms + depth_ms * lfo_r) * self.sr / 1000.0

            dl = self._read_interp(self.buffer_l, delay_l)
            dr = self._read_interp(self.buffer_r, delay_r)

            self.buffer_l[self.index] = left[i]
            self.buffer_r[self.index] = right[i]

            out_l[i] = left[i] * (1.0 - wet) + dl * wet
            out_r[i] = right[i] * (1.0 - wet) + dr * wet

            self.index = (self.index + 1) % self.size
            self.phase = (self.phase + rate_hz / self.sr) % 1.0

        return out_l.astype(np.float32), out_r.astype(np.float32)


class StereoToneCorrector:
    def __init__(self, sr: int, mode: str):
        self.sr = sr
        if mode == "pulse":
            cutoff = 4200.0
            sat = 0.22
        else:
            cutoff = 5600.0
            sat = 0.12
        self.sat_amount = sat
        self.lp_l = OnePoleLowpass(sr, cutoff)
        self.lp_r = OnePoleLowpass(sr, cutoff)

    def process(self, left: np.ndarray, right: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        left = self.lp_l.process(left)
        right = self.lp_r.process(right)
        left = 0.82 * left + 0.18 * softclip(left, self.sat_amount)
        right = 0.82 * right + 0.18 * softclip(right, self.sat_amount)
        return left.astype(np.float32), right.astype(np.float32)


@dataclass
class AmbientVoice:
    freq: float
    phase: float
    volume: float
    pan: float
    age: float
    attack: float
    trem_hz: float
    trem_depth: float
    vib_hz: float
    vib_cents: float


@dataclass
class PulseVoice:
    freq: float
    phase: float
    volume: float
    pan: float
    age: float
    duration: float
    vib_hz: float
    vib_cents: float


def stereo_pan(signal: np.ndarray, pan: float) -> Tuple[np.ndarray, np.ndarray]:
    pan = max(0.0, min(1.0, pan))
    left_gain = math.cos(pan * math.pi * 0.5)
    right_gain = math.sin(pan * math.pi * 0.5)
    return signal * left_gain, signal * right_gain


class SessionRecorder:
    def __init__(self, sample_rate: int):
        self.sample_rate = int(sample_rate)
        self.lock = threading.Lock()
        self.active = False
        self.frames: List[np.ndarray] = []
        self.pending_mix: Dict[str, np.ndarray] = {}
        self.started_at: Optional[float] = None

    def start(self):
        with self.lock:
            self.active = True
            self.frames = []
            self.pending_mix = {}
            self.started_at = time.time()

    def is_active(self) -> bool:
        with self.lock:
            return bool(self.active)

    def add_bus_block(self, voice_kind: str, variant: str, block: np.ndarray):
        if variant not in ("base", "sync"):
            return
        with self.lock:
            if not self.active:
                return
            active_variant = "sync" if is_sync_output_enabled() else "base"
            if variant != active_variant:
                return
            self.pending_mix[voice_kind] = np.array(block, dtype=np.float32, copy=True)
            pulse = self.pending_mix.get("pulse")
            ambient = self.pending_mix.get("ambient")
            if pulse is None or ambient is None:
                return
            mix = np.clip(pulse + ambient, -0.98, 0.98).astype(np.float32)
            self.frames.append(mix)
            self.pending_mix = {}

    def stop_and_save(self) -> Path:
        with self.lock:
            if not self.active:
                raise RuntimeError("Recording is not active")
            self.active = False
            frames = list(self.frames)
            self.frames = []
            self.pending_mix = {}
            started_at = self.started_at or time.time()
            self.started_at = None

        downloads_dir = Path.home() / "Downloads"
        downloads_dir.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y%m%d_%H%M%S", time.localtime(started_at))
        out_path = downloads_dir / f"liveplanting_recording_{timestamp}.wav"

        if frames:
            audio = np.concatenate(frames, axis=0)
        else:
            audio = np.zeros((0, 2), dtype=np.float32)

        pcm = np.clip(audio, -1.0, 1.0)
        pcm = (pcm * 32767.0).astype(np.int16)

        with wave.open(str(out_path), "wb") as wav_file:
            wav_file.setnchannels(2)
            wav_file.setsampwidth(2)
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes(pcm.tobytes())

        return out_path


class PlantSynth:
    def __init__(self, sr: int = SAMPLE_RATE, block_size: int = BLOCK_SIZE):
        self.sr = sr
        self.block_size = block_size
        self.lock = threading.Lock()

        self.master_gain = 0.25
        self.max_ambient_voices = 24
        self.max_pulse_voices = 24

        self.ambient_voices: Dict[str, List[AmbientVoice]] = {
            "base": [],
            "sync": [],
        }
        self.pulse_voices: Dict[str, List[PulseVoice]] = {
            "base": [],
            "sync": [],
        }

        self.correctors = {
            "pulse_base": StereoToneCorrector(sr, "pulse"),
            "ambient_base": StereoToneCorrector(sr, "ambient"),
            "pulse_sync": StereoToneCorrector(sr, "pulse"),
            "ambient_sync": StereoToneCorrector(sr, "ambient"),
        }
        self.sync_reverbs = {
            "pulse": StereoReverb(sr),
            "ambient": StereoReverb(sr),
        }
        self.sync_delays = {
            "pulse": StereoDelay(sr),
            "ambient": StereoDelay(sr),
        }
        self.sync_chorus = {
            "pulse": StereoChorus(sr),
            "ambient": StereoChorus(sr),
        }
        self.recorder = SessionRecorder(sr)

        self.streams = {
            "pulse_base": sd.OutputStream(
                samplerate=self.sr,
                channels=2,
                blocksize=self.block_size,
                dtype="float32",
                callback=self._make_callback("pulse", "base"),
                device=PULSE_OUTPUT_DEVICE,
            ),
            "ambient_base": sd.OutputStream(
                samplerate=self.sr,
                channels=2,
                blocksize=self.block_size,
                dtype="float32",
                callback=self._make_callback("ambient", "base"),
                device=AMBIENT_OUTPUT_DEVICE,
            ),
            "pulse_sync": sd.OutputStream(
                samplerate=self.sr,
                channels=2,
                blocksize=self.block_size,
                dtype="float32",
                callback=self._make_callback("pulse", "sync"),
                device=SYNC_PULSE_OUTPUT_DEVICE,
            ),
            "ambient_sync": sd.OutputStream(
                samplerate=self.sr,
                channels=2,
                blocksize=self.block_size,
                dtype="float32",
                callback=self._make_callback("ambient", "sync"),
                device=SYNC_AMBIENT_OUTPUT_DEVICE,
            ),
        }

    def start(self):
        for stream in self.streams.values():
            stream.start()

    def stop(self):
        try:
            self.clear_all()
        except Exception:
            pass
        for stream in self.streams.values():
            try:
                stream.stop()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass
        try:
            sd.stop()
        except Exception:
            pass

    def toggle_recording(self) -> Tuple[bool, Optional[Path]]:
        if self.recorder.is_active():
            saved_path = self.recorder.stop_and_save()
            return False, saved_path
        self.recorder.start()
        return True, None

    def reset_ambience(self):
        with self.lock:
            self.ambient_voices["base"].clear()
            self.ambient_voices["sync"].clear()

    def clear_all(self):
        with self.lock:
            self.ambient_voices["base"].clear()
            self.ambient_voices["sync"].clear()
            self.pulse_voices["base"].clear()
            self.pulse_voices["sync"].clear()

    def add_ambient_voice(self, midi_note: int, stream_variant: str, volume: float = 0.10, pan: float = 0.5):
        voice = AmbientVoice(
            freq=midi_to_freq(midi_note),
            phase=0.0,
            volume=float(volume),
            pan=float(pan),
            age=0.0,
            attack=1.2,
            trem_hz=0.08 + random.random() * 0.18,
            trem_depth=0.05 + random.random() * 0.10,
            vib_hz=4.6 + random.random() * 0.8,
            vib_cents=6.0 + random.random() * 5.0,
        )
        with self.lock:
            self.ambient_voices[stream_variant].append(voice)
            self.ambient_voices[stream_variant] = self.ambient_voices[stream_variant][-self.max_ambient_voices:]

    def add_pulse_voice(self, midi_note: int, stream_variant: str, volume: float = 0.45, duration: float = 0.3, pan: float = 0.5):
        voice = PulseVoice(
            freq=midi_to_freq(midi_note),
            phase=0.0,
            volume=float(volume),
            pan=float(pan),
            age=0.0,
            duration=float(duration),
            vib_hz=5.0,
            vib_cents=6.0,
        )
        with self.lock:
            if len(self.pulse_voices[stream_variant]) >= self.max_pulse_voices:
                self.pulse_voices[stream_variant].pop(0)
            self.pulse_voices[stream_variant].append(voice)

    def render_ambient(self, voice: AmbientVoice, t: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        age = voice.age + t
        attack_env = np.clip(age / max(0.001, voice.attack), 0.0, 1.0)
        trem = 1.0 + voice.trem_depth * np.sin(2 * np.pi * voice.trem_hz * age)
        vib_ratio = 2 ** ((voice.vib_cents * np.sin(2 * np.pi * voice.vib_hz * age)) / 1200.0)
        freq = voice.freq * vib_ratio
        phase_inc = 2 * np.pi * freq / self.sr
        phase = voice.phase + np.cumsum(phase_inc)

        signal = (
            np.sin(phase)
            + 0.12 * np.sin(2 * phase)
            + 0.02 * np.sin(3 * phase)
        ).astype(np.float32)

        signal *= (voice.volume * attack_env * trem).astype(np.float32)
        voice.phase = float(phase[-1] % (2 * np.pi))
        voice.age += len(t) / self.sr
        return stereo_pan(signal, voice.pan)

    def render_pulse(self, voice: PulseVoice, t: np.ndarray) -> Tuple[np.ndarray, np.ndarray, bool]:
        age = voice.age + t
        alive = age < voice.duration
        if not np.any(alive):
            return np.zeros_like(t), np.zeros_like(t), False

        env = np.zeros_like(t, dtype=np.float32)
        tt = age[alive]

        attack = min(0.04, voice.duration * 0.22)
        release_start = voice.duration * 0.60

        env_alive = np.ones_like(tt, dtype=np.float32)
        if attack > 0:
            env_alive = np.minimum(env_alive, np.clip(tt / attack, 0.0, 1.0))
        rel_mask = tt >= release_start
        if np.any(rel_mask):
            rel = (voice.duration - tt[rel_mask]) / max(0.001, voice.duration - release_start)
            env_alive[rel_mask] *= np.clip(rel, 0.0, 1.0)

        env[alive] = env_alive ** 1.2

        vib_ratio = 2 ** ((voice.vib_cents * np.sin(2 * np.pi * voice.vib_hz * age)) / 1200.0)
        freq = voice.freq * vib_ratio
        phase_inc = 2 * np.pi * freq / self.sr
        phase = voice.phase + np.cumsum(phase_inc)

        signal = (
            np.sin(phase)
            + 0.10 * np.sin(2 * phase)
            + 0.015 * np.sin(3 * phase)
        ).astype(np.float32)

        signal *= (voice.volume * env).astype(np.float32)
        voice.phase = float(phase[-1] % (2 * np.pi))
        voice.age += len(t) / self.sr

        left, right = stereo_pan(signal, voice.pan)
        still_alive = voice.age < voice.duration
        return left, right, still_alive

    def _make_callback(self, voice_kind: str, variant: str):
        def callback(outdata, frames, time_info, status):
            audio = self.render_bus(voice_kind, variant, frames)
            outdata[:] = audio
        return callback

    def render_bus(self, voice_kind: str, variant: str, frames: int) -> np.ndarray:
        t = np.arange(frames, dtype=np.float32) / self.sr
        left = np.zeros(frames, dtype=np.float32)
        right = np.zeros(frames, dtype=np.float32)

        with self.lock:
            if voice_kind == "ambient":
                voice_copy = list(self.ambient_voices[variant])
            else:
                voice_copy = list(self.pulse_voices[variant])

        if voice_kind == "ambient":
            for voice in voice_copy:
                l, r = self.render_ambient(voice, t)
                left += l
                right += r
            with self.lock:
                self.ambient_voices[variant] = voice_copy
        else:
            survivors = []
            for voice in voice_copy:
                l, r, alive = self.render_pulse(voice, t)
                left += l
                right += r
                if alive:
                    survivors.append(voice)
            with self.lock:
                self.pulse_voices[variant] = survivors

        corrector = self.correctors[f"{voice_kind}_{variant}"]
        left, right = corrector.process(left, right)

        if variant == "sync":
            reverb_amount, distortion_amount, delay_amount, chorus_amount = get_fx_params(True)
            if chorus_amount > 0.0001:
                left, right = self.sync_chorus[voice_kind].process(left, right, chorus_amount)
            if distortion_amount > 0.0001:
                left = softclip(left, distortion_amount)
                right = softclip(right, distortion_amount)
            if delay_amount > 0.0001:
                left, right = self.sync_delays[voice_kind].process(left, right, delay_amount)
            if reverb_amount > 0.0001:
                left, right = self.sync_reverbs[voice_kind].process(left, right, reverb_amount)

        active_pair_sync = is_sync_output_enabled()
        this_bus_active = (variant == "sync" and active_pair_sync) or (variant == "base" and not active_pair_sync)

        out = np.stack([left, right], axis=1)
        if this_bus_active:
            out *= self.master_gain
        else:
            out *= 0.0
        out = np.clip(out, -0.98, 0.98).astype(np.float32)
        self.recorder.add_bus_block(voice_kind, variant, out)
        return out


class SerialReader(threading.Thread):
    def __init__(self, synth: PlantSynth, port: str = SERIAL_PORT, baudrate: int = SERIAL_BAUDRATE):
        super().__init__(daemon=True)
        self.synth = synth
        self.port = port
        self.baudrate = baudrate
        self.stop_event = threading.Event()
        self.serial_conn: Optional[serial.Serial] = None

        self.last_pulse_time = 0.0
        self.humidity_values: List[float] = []
        self.window_start_time: Optional[float] = None
        self.zero_semis_streak = 0
        self.amb_stopped_due_zero = False

        self.pulse_interval = 0.20

    def connect(self):
        self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=0.1)
        print(f"[SERIAL] connected to {self.port} @ {self.baudrate}")

    def close(self):
        if self.serial_conn:
            try:
                self.serial_conn.close()
            except Exception:
                pass
            self.serial_conn = None

    def reset_humidity_window(self):
        self.humidity_values.clear()
        self.window_start_time = None
        self.zero_semis_streak = 0
        self.amb_stopped_due_zero = False

    def parse_line(self, line: str) -> Dict[str, Optional[float]]:
        line = line.strip()
        if not line:
            return {}

        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                humidity = data.get("humidity", data.get("hum", None))
                return {
                    "adc": float(data.get("adc", data.get("value", 0))),
                    "humidity": None if humidity is None else float(humidity),
                    "touch": float(data.get("touch", data.get("gate", 0))),
                }
            except Exception:
                pass

        result = {}
        tokens = line.replace(",", " ").split()
        for token in tokens:
            if ":" in token:
                k, v = token.split(":", 1)
                try:
                    result[k.strip().lower()] = float(v)
                except Exception:
                    pass

        if result:
            humidity = result.get("humidity", result.get("hum", None))
            return {
                "adc": float(result.get("adc", result.get("value", 0))),
                "humidity": None if humidity is None else float(humidity),
                "touch": float(result.get("touch", result.get("gate", 0))),
            }

        parts = [p.strip() for p in line.split(",") if p.strip()]
        nums = []
        for p in parts:
            try:
                nums.append(float(p))
            except Exception:
                pass

        if len(nums) == 1:
            return {"adc": nums[0], "humidity": None, "touch": 1.0}
        if len(nums) >= 2:
            return {"humidity": nums[0], "adc": nums[1], "touch": 1.0}

        return {}

    def process_data(self, data: Dict[str, Optional[float]]):
        now = time.time()

        adc = int(data.get("adc", 0) or 0)
        humidity = data.get("humidity", None)
        touch = float(data.get("touch", 1) or 0)

        if is_pulse_enabled() and adc > 0:
            pan = max(0.0, min(1.0, adc / 1023.0))
            pulse_volume = 0.35 + 0.30 * pan
            if touch > 0 and (now - self.last_pulse_time) >= self.pulse_interval:
                for variant in ("base", "sync"):
                    pulse_note = adc_to_note(
                        adc,
                        root_midi=get_pulse_root_midi(variant == "sync"),
                        max_semitones=60,
                        scale_offsets=get_scale_offsets(variant == "sync"),
                    )
                    self.synth.add_pulse_voice(
                        pulse_note,
                        stream_variant=variant,
                        volume=pulse_volume,
                        duration=0.22 + 0.18 * pan,
                        pan=pan,
                    )
                self.last_pulse_time = now

        if not is_ambient_enabled():
            return

        if humidity is None:
            self.reset_humidity_window()
            return

        humidity_value = float(humidity)
        base_root = get_ambient_root_midi(False)
        ambient_note_now = humidity_to_note(
            humidity_value,
            root_midi=base_root,
            h_min=HUMIDITY_MIN,
            h_max=HUMIDITY_MAX,
            max_semitones=36,
            scale_offsets=get_scale_offsets(False),
        )
        hum_semis_now = ambient_note_now - base_root

        if hum_semis_now == 0:
            self.zero_semis_streak += 1
        else:
            self.zero_semis_streak = 0
            self.amb_stopped_due_zero = False

        if self.zero_semis_streak >= 2:
            if not self.amb_stopped_due_zero:
                self.synth.reset_ambience()
                self.humidity_values.clear()
                self.window_start_time = now
                self.amb_stopped_due_zero = True
        else:
            self.humidity_values.append(humidity_value)
            if self.window_start_time is None:
                self.window_start_time = now

            elapsed = now - self.window_start_time
            if elapsed >= HUMIDITY_WINDOW_SECONDS and len(self.humidity_values) > 0:
                avg_humidity = sum(self.humidity_values) / len(self.humidity_values)
                pan = max(0.0, min(1.0, adc / 1023.0)) if adc > 0 else 0.5
                ambient_volume = 0.07 + 0.07 * min(1.0, avg_humidity / 1023.0)

                for variant in ("base", "sync"):
                    ambient_root_midi = get_ambient_root_midi(variant == "sync")
                    ambient_note = humidity_to_note(
                        avg_humidity,
                        root_midi=ambient_root_midi,
                        h_min=HUMIDITY_MIN,
                        h_max=HUMIDITY_MAX,
                        max_semitones=36,
                        scale_offsets=get_scale_offsets(variant == "sync"),
                    )
                    self.synth.add_ambient_voice(
                        ambient_note,
                        stream_variant=variant,
                        volume=ambient_volume,
                        pan=1.0 - pan,
                    )
                self.humidity_values.clear()
                self.window_start_time = now

    def run(self):
        try:
            self.connect()
        except Exception as e:
            print(f"[SERIAL] connection error: {e}")
            return

        try:
            while not self.stop_event.is_set():
                try:
                    raw = self.serial_conn.readline().decode("utf-8", errors="ignore").strip()
                    if not raw:
                        continue
                    data = self.parse_line(raw)
                    self.process_data(data)
                except Exception as e:
                    print(f"[SERIAL] read error: {e}")
                    time.sleep(0.05)
        finally:
            self.close()

    def stop(self):
        self.stop_event.set()


class TerminalController(threading.Thread):
    def __init__(self, synth: PlantSynth, serial_reader: SerialReader):
        super().__init__(daemon=True)
        self.synth = synth
        self.serial_reader = serial_reader
        self.stop_event = threading.Event()

    def run(self):
        print("[KEYS] A=start pulse | B=stop all+reset ambience | C=toggle ambience | D=toggle sync output | E=record to Downloads | Q=quit")

        if sys.platform.startswith("win"):
            self._run_windows()
        else:
            self._run_unix()

    def _run_windows(self):
        import msvcrt
        while not self.stop_event.is_set():
            if msvcrt.kbhit():
                ch = msvcrt.getch().decode(errors="ignore").lower()
                self.handle_key(ch)
            time.sleep(0.05)

    def _run_unix(self):
        import tty
        import termios

        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setcbreak(fd)
            while not self.stop_event.is_set():
                r, _, _ = select.select([sys.stdin], [], [], 0.1)
                if r:
                    ch = sys.stdin.read(1).lower()
                    self.handle_key(ch)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

    def handle_key(self, ch: str):
        if ch == "a":
            set_pulse_enabled(True)
            print("[STATE] pulse listening ON")
        elif ch == "b":
            set_pulse_enabled(False)
            set_ambient_enabled(False)
            set_sync_output_enabled(is_sync_output_enabled())
            self.serial_reader.reset_humidity_window()
            self.synth.clear_all()
            print("[STATE] all listening OFF + ambience RESET")
        elif ch == "c":
            new_state = not is_ambient_enabled()
            set_ambient_enabled(new_state)
            self.serial_reader.reset_humidity_window()
            if not new_state:
                self.synth.reset_ambience()
                print("[STATE] ambience OFF + RESET")
            else:
                print("[STATE] ambience ON")
        elif ch == "d":
            new_state = not is_sync_output_enabled()
            set_sync_output_enabled(new_state)
            mode = "SYNC" if new_state else "BASE"
            linked = is_sync_linked()
            if new_state and linked:
                print(f"[STATE] output mode -> {mode} (SolarSynth params live)")
            elif new_state:
                print(f"[STATE] output mode -> {mode} (using current SolarSynth state; updates will apply live when they arrive)")
            else:
                print(f"[STATE] output mode -> {mode}")
        elif ch == "e":
            try:
                is_now_recording, saved_path = self.synth.toggle_recording()
                if is_now_recording:
                    print("[REC] recording started (press E again to stop and save in Downloads)")
                else:
                    print(f"[REC] recording saved: {saved_path}")
            except Exception as e:
                print(f"[REC] error: {e}")
        elif ch == "q":
            set_pulse_enabled(False)
            set_ambient_enabled(False)
            self.serial_reader.reset_humidity_window()
            if self.synth.recorder.is_active():
                try:
                    saved_path = self.synth.recorder.stop_and_save()
                    print(f"[REC] recording saved: {saved_path}")
                except Exception as e:
                    print(f"[REC] error while saving on quit: {e}")
            self.synth.clear_all()
            print("[STATE] quit")
            self.stop_event.set()

    def stop(self):
        self.stop_event.set()


async def sync_client(stop_flag: threading.Event):
    while not stop_flag.is_set():
        try:
            async with websockets.connect(WS_URI) as ws:
                print(f"[SYNC] connected to {WS_URI}")
                async for msg in ws:
                    try:
                        payload = json.loads(msg)
                    except Exception:
                        continue

                    if payload.get("type") != "synth_state":
                        continue

                    scale = normalize_scale_name(payload.get("scale", sync_state["scale"]))
                    reverb = clamp01(payload.get("reverb", sync_state["reverb"]))
                    distortion = clamp01(payload.get("distortion", sync_state["distortion"]))
                    delay = clamp01(payload.get("delay", sync_state["delay"]))
                    chorus = clamp01(payload.get("chorus", sync_state.get("chorus", 0.0)))
                    try:
                        key_pc = int(payload.get("key", sync_state.get("key", 0))) % 12
                    except Exception:
                        key_pc = 0

                    if scale not in SCALE_OFFSETS:
                        scale = "major"

                    with sync_lock:
                        sync_state["scale"] = scale
                        sync_state["key"] = key_pc
                        sync_state["reverb"] = reverb
                        sync_state["distortion"] = distortion
                        sync_state["delay"] = delay
                        sync_state["chorus"] = chorus
                        sync_state["last_update"] = time.time()

                    print(
                        f"[SYNC] scale={scale} "
                        f"key={key_pc} "
                        f"reverb={reverb:.3f} "
                        f"distortion={distortion:.3f} "
                        f"delay={delay:.3f} "
                        f"chorus={chorus:.3f}"
                    )
        except Exception as e:
            print(f"[SYNC] connection error: {e}")
            if stop_flag.is_set():
                break
            print("[SYNC] reconnecting in 2 seconds...")
            await asyncio.sleep(2)


async def main():
    synth = PlantSynth()
    synth.start()

    serial_reader = SerialReader(synth, port=SERIAL_PORT, baudrate=SERIAL_BAUDRATE)
    serial_reader.start()

    terminal_controller = TerminalController(synth, serial_reader)
    terminal_controller.start()

    stop_flag = threading.Event()
    sync_task = asyncio.create_task(sync_client(stop_flag))

    try:
        while not terminal_controller.stop_event.is_set():
            await asyncio.sleep(0.2)
    except KeyboardInterrupt:
        print("\n[INFO] closing...")
    finally:
        stop_flag.set()
        set_pulse_enabled(False)
        set_ambient_enabled(False)
        terminal_controller.stop()
        serial_reader.stop()
        serial_reader.join(timeout=1.0)
        if synth.recorder.is_active():
            try:
                saved_path = synth.recorder.stop_and_save()
                print(f"[REC] recording saved: {saved_path}")
            except Exception as e:
                print(f"[REC] error while saving on shutdown: {e}")
        synth.clear_all()
        synth.stop()
        try:
            await asyncio.wait_for(sync_task, timeout=1.0)
        except Exception:
            sync_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
