import asyncio
import json
import time
from fractions import Fraction
from typing import Dict, List, Optional

import numpy as np
from aiohttp import web, WSMsgType
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    MediaStreamTrack,
)
from aiortc.sdp import candidate_from_sdp
from av import AudioFrame


SAMPLE_RATE = 48000
CHANNELS = 2
FRAME_SAMPLES = 960  # 20 ms @ 48 kHz
FRAME_BYTES = FRAME_SAMPLES * CHANNELS * 2  # int16 stereo
MAX_BUFFER_BYTES = FRAME_BYTES * 10  # ~200 ms buffer cap for low latency
MIN_START_BUFFER_BYTES = FRAME_BYTES * 3  # ~60 ms prebuffer to reduce crackle

PCS: Dict[str, RTCPeerConnection] = {}
PENDING_REMOTE_CANDIDATES: Dict[str, List[dict]] = {}
PENDING_LOCAL_CANDIDATES: Dict[str, List[dict]] = {}


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


async def options_handler(request):
    return web.Response(status=200, headers=CORS_HEADERS)


def make_peer_id() -> str:
    return f"peer_{int(time.time() * 1000)}"


class SharedPcmBus:
    def __init__(self, name: str):
        self.name = name
        self.buffer = bytearray()
        self.subscribers: List["PcmAudioTrack"] = []
        self.lock = asyncio.Lock()

    def subscribe(self, track: "PcmAudioTrack"):
        self.subscribers.append(track)

    async def push(self, data: bytes):
        if not data:
            return
        async with self.lock:
            self.buffer.extend(data)
            if len(self.buffer) > MAX_BUFFER_BYTES:
                # Drop old audio and keep only the most recent chunk window.
                self.buffer = self.buffer[-MAX_BUFFER_BYTES:]

    async def read_exact_or_silence(self, size: int) -> bytes:
        async with self.lock:
            if len(self.buffer) >= size:
                out = bytes(self.buffer[:size])
                del self.buffer[:size]
                return out

            if len(self.buffer) > 0:
                out = bytes(self.buffer)
                self.buffer.clear()
                out += b"\x00" * (size - len(out))
                return out

            return b"\x00" * size


class PcmAudioTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, name: str, bus: SharedPcmBus):
        super().__init__()
        self.name = name
        self.bus = bus
        self.bus.subscribe(self)
        self.pts = 0
        self.next_frame_time = time.monotonic()

    async def recv(self):
        while len(self.bus.buffer) < MIN_START_BUFFER_BYTES:
            await asyncio.sleep(0.002)

        pcm_bytes = await self.bus.read_exact_or_silence(FRAME_BYTES)

        pcm = np.frombuffer(pcm_bytes, dtype=np.int16)
        if pcm.size != FRAME_SAMPLES * CHANNELS:
            fixed = np.zeros(FRAME_SAMPLES * CHANNELS, dtype=np.int16)
            n = min(fixed.size, pcm.size)
            fixed[:n] = pcm[:n]
            pcm = fixed

        ## modified
        packed = pcm.reshape(1, -1)

        self.total_frames = getattr(self, "total_frames", 0) + 1
        self.silent_frames = getattr(self, "silent_frames", 0)

        peak = int(np.max(np.abs(pcm))) if pcm.size else 0

        frame = AudioFrame.from_ndarray(
            packed,
            format="s16",
            layout="stereo"
        )

        if peak == 0:
            self.silent_frames += 1

        ##end

        
        frame.sample_rate = SAMPLE_RATE
        frame.pts = self.pts
        frame.time_base = Fraction(1, SAMPLE_RATE)

        self.pts += frame.samples

        # Stable realtime pacing: keep 20 ms frame cadence without rebuilding latency.
        self.next_frame_time += FRAME_SAMPLES / SAMPLE_RATE
        delay = self.next_frame_time - time.monotonic()

        if delay > 0:
            await asyncio.sleep(delay)
        else:
            # If we are late, resync to now instead of accumulating delay.
            self.next_frame_time = time.monotonic()

        return frame


class UdpReceiver(asyncio.DatagramProtocol):
    def __init__(self, bus: SharedPcmBus):
        self.bus = bus

    def datagram_received(self, data, addr):
        asyncio.create_task(self.bus.push(data))


solar_bus = SharedPcmBus("solar")
plant_base_bus = SharedPcmBus("plant_base")
plant_sync_bus = SharedPcmBus("plant_sync")


async def solar_ws(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    print("[Bridge] Solar WebSocket connected")

    async for msg in ws:
        if msg.type == WSMsgType.BINARY:

            pcm = np.frombuffer(msg.data, dtype=np.int16)

            await solar_bus.push(msg.data)

        elif msg.type == WSMsgType.ERROR:
            print("[Bridge] Solar WebSocket error:", ws.exception())

    print("[Bridge] Solar WebSocket disconnected")
    return ws


def serialize_candidate(candidate) -> Optional[dict]:
    if candidate is None:
        return None

    cand = getattr(candidate, "candidate", None)
    sdp_mid = getattr(candidate, "sdpMid", None)
    sdp_mline_index = getattr(candidate, "sdpMLineIndex", None)

    if not cand:
        return None

    return {
        "candidate": cand,
        "sdpMid": sdp_mid,
        "sdpMLineIndex": sdp_mline_index,
    }


async def offer(request):
    params = await request.json()

    pc = RTCPeerConnection()
    peer_id = params.get("peerId") or make_peer_id()
    PCS[peer_id] = pc
    PENDING_LOCAL_CANDIDATES[peer_id] = PENDING_LOCAL_CANDIDATES.get(peer_id, [])

    solar_track = PcmAudioTrack("solar", solar_bus)
    plant_base_track = PcmAudioTrack("plant_base", plant_base_bus)
    plant_sync_track = PcmAudioTrack("plant_sync", plant_sync_bus)

    pc.addTrack(solar_track)
    pc.addTrack(plant_base_track)
    pc.addTrack(plant_sync_track)

    @pc.on("icecandidate")
    def on_icecandidate(candidate):
        payload = serialize_candidate(candidate)
        if payload:
            PENDING_LOCAL_CANDIDATES.setdefault(peer_id, []).append(payload)

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        print(f"[WebRTC] {peer_id} state={pc.connectionState}")
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await cleanup_peer(peer_id)

    await pc.setRemoteDescription(
        RTCSessionDescription(sdp=params["sdp"], type=params["type"])
    )

    for cand in PENDING_REMOTE_CANDIDATES.pop(peer_id, []):
        await add_candidate_to_pc(pc, cand)

    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.json_response(
        {
            "peerId": peer_id,
            "type": pc.localDescription.type,
            "sdp": pc.localDescription.sdp,
        },
        headers=CORS_HEADERS,
    )


async def candidate(request):
    params = await request.json()
    peer_id = params["peerId"]
    cand = {
        "candidate": params.get("candidate"),
        "sdpMid": params.get("sdpMid"),
        "sdpMLineIndex": params.get("sdpMLineIndex"),
    }

    pc = PCS.get(peer_id)
    if pc is None or pc.remoteDescription is None:
        PENDING_REMOTE_CANDIDATES.setdefault(peer_id, []).append(cand)
        return web.json_response({"ok": True, "queued": True}, headers=CORS_HEADERS)

    await add_candidate_to_pc(pc, cand)
    return web.json_response({"ok": True, "queued": False}, headers=CORS_HEADERS)


async def add_candidate_to_pc(pc: RTCPeerConnection, cand: dict):
    candidate_str = cand.get("candidate")
    if not candidate_str:
        return

    if candidate_str.startswith("candidate:"):
        candidate_str = candidate_str[len("candidate:"):]

    ice = candidate_from_sdp(candidate_str)
    ice.sdpMid = cand.get("sdpMid")
    ice.sdpMLineIndex = cand.get("sdpMLineIndex")

    await pc.addIceCandidate(ice)


async def poll_candidates(request):
    peer_id = request.query.get("peerId")
    if not peer_id:
        return web.json_response({"candidates": []}, headers=CORS_HEADERS)

    candidates = PENDING_LOCAL_CANDIDATES.get(peer_id, [])
    PENDING_LOCAL_CANDIDATES[peer_id] = []
    return web.json_response({"candidates": candidates}, headers=CORS_HEADERS)


async def cleanup_peer(peer_id: str):
    pc = PCS.pop(peer_id, None)
    if pc:
        try:
            await pc.close()
        except Exception:
            pass
    PENDING_REMOTE_CANDIDATES.pop(peer_id, None)
    PENDING_LOCAL_CANDIDATES.pop(peer_id, None)


async def on_startup(app):
    loop = asyncio.get_running_loop()

    await loop.create_datagram_endpoint(
        lambda: UdpReceiver(plant_base_bus),
        local_addr=("127.0.0.1", 9102),
    )

    await loop.create_datagram_endpoint(
        lambda: UdpReceiver(plant_sync_bus),
        local_addr=("127.0.0.1", 9103),
    )

    print("UDP listening: 9102 -> plant_base, 9103 -> plant_sync")
    print("Solar WebSocket: ws://127.0.0.1:8080/solar")
    print("Offer endpoint:   http://127.0.0.1:8080/offer")
    print("Candidate in:     http://127.0.0.1:8080/candidate")
    print("Candidate poll:   http://127.0.0.1:8080/candidates?peerId=...")


async def on_shutdown(app):
    for peer_id in list(PCS.keys()):
        await cleanup_peer(peer_id)


app = web.Application()
app.router.add_get("/solar", solar_ws)
app.router.add_route("OPTIONS", "/offer", options_handler)
app.router.add_route("OPTIONS", "/candidate", options_handler)
app.router.add_route("OPTIONS", "/candidates", options_handler)
app.router.add_post("/offer", offer)
app.router.add_post("/candidate", candidate)
app.router.add_get("/candidates", poll_candidates)

app.on_startup.append(on_startup)
app.on_shutdown.append(on_shutdown)

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=8080)