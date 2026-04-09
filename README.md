# Heliobioma

An installation that connects two projects: **Solar Synth**, which sonifies real-time solar wind data from NOAA, and **Live Planting**, which sonifies bioelectrical signals and soil humidity from a living plant. A shared WebSocket server bridges them so that the musical parameters of Solar Synth (scale, key, effects) are transmitted live to the plant's audio engine, creating a dialogue between the cosmos and the plant.

---

## Projects Overview

### 1. SolarSynth
**Location:** `SolarSynth_modified/`

A browser-based synthesizer that fetches real-time solar wind data (speed, density, temperature) from the NOAA API and converts it into music via an arpeggiator. The user can interact with effects (reverb, delay, chorus, distortion), scales, keys, and BPM. These parameters are continuously broadcast over WebSocket to the sync server.

### 2. Live Planting
**Location:** `LivePlanting_modified/`

A Python audio engine connected to an Arduino MEGA. The Arduino reads:
- **A1** — Capacitive soil moisture sensor → drives **ambient notes** (averaged over 20s windows, mapped to a 3-octave scale)
- **A2** — Symbiotic Kit bioelectrical sensor → drives **pulse notes** (mapped to a 5-octave range)

The Python backend synthesizes audio in real time using `sounddevice` and receives the musical context (scale, key, effects) from Solar Synth via the sync server.

### 3. Sync Server
**File:** `sync_server_modified_toggleD_liveparams.py`

A lightweight WebSocket relay (port **8765**). It receives `synth_state` messages from Solar Synth (scale, key, reverb, distortion, delay, chorus) and broadcasts them to all other connected clients — in particular, to the Live Planting audio controller, which adapts its sonification accordingly.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         HARDWARE                                 │
│                                                                  │
│   Arduino MEGA 2560                                              │
│   ├── A1: Soil Moisture Sensor ──► humidity value (0–1023)       │
│   └── A2: Symbiotic Kit (bioelectric) ──► bio value (0–1023)    │
│                  │ Serial (COM10, 9600 baud)                     │
└──────────────────┼───────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│           LIVE PLANTING — audio_controller_http.py               │
│                                                                  │
│  • Reads serial data from Arduino                                │
│  • Synthesizes pulse notes (bio signal) + ambient notes          │
│    (humidity) using additive synthesis + Schroeder reverb        │
│  • HTTP server on http://localhost:8080 (start/stop controls)    │
│  • WebSocket client → connects to Sync Server (port 8765)        │
│    to receive synth_state and adapt scale/key/effects            │
│                                                                  │
│  Controls (keyboard):                                            │
│    A = start pulse  |  B = stop all  |  C = toggle ambience      │
│    D = toggle sync output  |  E = record  |  Q = quit            │
└──────────────────────────────────────────────────────────────────┘
          ▲                              ▲
          │ WebSocket (ws://localhost:8765)│
          │                              │
┌─────────┴──────────────────────────────┴─────────────────────────┐
│                   SYNC SERVER — port 8765                        │
│                                                                  │
│  • Accepts multiple WebSocket clients                            │
│  • Relays every incoming message to all other connected clients  │
│  • Bridges Solar Synth ──► Live Planting                         │
└──────────────────────────────┬───────────────────────────────────┘
                               │ WebSocket (ws://localhost:8765)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│          SOLAR SYNTH — SolarSynth_modified/index.html            │
│                 (served via VS Code Live Server)                  │
│                                                                  │
│  • Fetches NOAA solar wind data (speed, density, temperature)    │
│  • Arpeggiator maps data to notes via Tone.js                    │
│  • User controls: scale, key, BPM, effects (reverb/delay/        │
│    chorus/distortion), EQ, drag-and-drop automation              │
│  • liveplanting-sync.js polls synth state every 100ms and        │
│    sends it to Sync Server as { type: "synth_state", scale,      │
│    key, reverb, distortion, delay, chorus }                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Software
- [VS Code](https://code.visualstudio.com/) with the **Live Server** extension
- [Arduino IDE](https://www.arduino.cc/en/software)
- Python 3.8+

### Python dependencies
Install with:
```bash
pip install numpy sounddevice pyserial websockets aiohttp
```

### Hardware
- Arduino MEGA 2560
- APKLVSR capacitive soil moisture sensor (connected to pin **A1**)
- Symbiotic Kit by Spad Electronics (connected to pin **A2**)
- TENS electrodes on plant leaves

---

## Startup Procedure

Follow these steps **in order**.

### Step 1 — Upload the Arduino sketch

1. Open **Arduino IDE**.
2. Open the file:
   ```
   LivePlanting_modified/arduino/sketch_dec3a_fix/sketch_dec3a_fix.ino
   ```
3. Select your board (**Arduino MEGA 2560**) and the correct **COM port**.
4. Click **Upload**.
5. Note the COM port (e.g. `COM10`). If it differs, edit `audio_controller_http.py`:
   ```python
   SERIAL_PORT = "COM10"  # change to your port
   ```

### Step 2 — Run the Sync Server (first time)

1. In VS Code, open the file:
   ```
   sync_server_modified_toggleD_liveparams.py
   ```
2. Run it (click **Run** or press `F5`).
   You should see:
   ```
   Sync server running on ws://localhost:8765
   ```
   Leave it running.

### Step 3 — Open Solar Synth with Live Server

1. In VS Code, go to **File → Open Folder** and select the folder:
   ```
   SolarSynth_modified/
   ```
   > Note: opening a new folder will close the currently open files in VS Code.
2. In the VS Code file explorer, open `index.html`.
3. Right-click and select **Open with Live Server** (or click the **Go Live** button in the status bar).
4. Solar Synth will open in your browser. Press **PLAY** to start the arpeggiator.

### Step 4 — Re-run the Sync Server

Because opening a new folder in VS Code closed the sync server file:

1. Go to **File → Open File** and re-open:
   ```
   sync_server_modified_toggleD_liveparams.py
   ```
2. Run it again.
   > Yes, this double-launch is necessary — the first run gets interrupted when the folder changes; the second run is the one that actually bridges Solar Synth and Live Planting.

### Step 5 — Run the Live Planting audio controller

1. Go to **File → Open File** and open:
   ```
   LivePlanting_modified/audio_controller_http.py
   ```
2. Run it.
   You should see confirmation that the audio engine, HTTP server (port 8080), and WebSocket connection to the sync server are active.
3. The controller will open its own web interface (or you can open `LivePlanting_modified/html/live_listening.html` via browser).
4. Press **A** in the terminal (or click **Start Listening** in the UI) to begin sonification.

---

## Data Flow Summary

```
Plant sensors (A1, A2)
        │ serial CSV
        ▼
audio_controller_http.py  ←──── synth_state (scale, key, effects)
        │                              ▲
        │ audio output                 │ WebSocket relay
        ▼                              │
    Speakers              sync_server_modified_toggleD_liveparams.py
                                       ▲
                                       │ WebSocket
                              Solar Synth (browser)
                                       │
                               NOAA solar wind API
```

---

## Key Parameters Synced from Solar Synth to Live Planting

| Parameter    | Description                                           |
|--------------|-------------------------------------------------------|
| `scale`      | Musical scale (e.g. major, minor, dorian, pentatonic) |
| `key`        | Root note (0–11, where 0 = C)                         |
| `reverb`     | Reverb wet mix (0.0–1.0)                              |
| `distortion` | Distortion wet mix (0.0–1.0)                          |
| `delay`      | Delay wet mix (0.0–1.0)                               |
| `chorus`     | Chorus wet mix (0.0–1.0)                              |

These arrive as WebSocket messages of type `synth_state` and update the plant audio engine in real time.


