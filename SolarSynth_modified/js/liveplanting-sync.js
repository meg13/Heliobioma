
const DEFAULT_WS_URL = 'ws://127.0.0.1:8765';
const DEFAULT_INTERVAL_MS = 100;
const RECONNECT_DELAY_MS = 2000;

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeScaleName(name) {
  if (!name) return 'major';
  const s = String(name).trim().toLowerCase();
  const aliases = {
    major: 'major',
    ionian: 'major',
    maj: 'major',
    minor: 'minor',
    aeolian: 'minor',
    'natural minor': 'minor',
    min: 'minor',
    dorian: 'dorian',
    mixolydian: 'mixolydian',
    lydian: 'lydian',
    phrygian: 'phrygian',
    locrian: 'locrian',
    'major pentatonic': 'pentatonic_major',
    'pentatonic major': 'pentatonic_major',
    'minor pentatonic': 'pentatonic_minor',
    'pentatonic minor': 'pentatonic_minor',
    chromatic: 'chromatic',
    custom: 'custom',
    none: 'none'
  };
  return aliases[s] || s.replace(/\s+/g, '_');
}

function getAudioModule() {
  return window.audioModule || {};
}

function isEffectActive(effectName) {
  return !!document.querySelector(`[data-effect="${effectName}"].active`);
}

function getKey() {
  const raw = document.getElementById('rootNoteSelect')?.value ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? ((Math.trunc(n) % 12) + 12) % 12 : 0;
}

function getScale() {
  return normalizeScaleName(
    document.getElementById('scaleSelect')?.value ||
    window.audioModule?.currentScale ||
    window.audioModule?.selectedScale ||
    'major'
  );
}

function getReverbWet() {
  const a = getAudioModule();
  if (!isEffectActive('reverb')) return 0;
  return clamp01(
    a.reverb?.wet?.value ??
    a.reverb?._lastWet ??
    0,
    0
  );
}

function getDistortionWet() {
  const a = getAudioModule();
  if (!isEffectActive('distortion')) return 0;
  return clamp01(
    a.distortion?.wet?.value ??
    a.distortion?._lastWet ??
    0,
    0
  );
}

function getDelayWet() {
  const a = getAudioModule();
  if (!isEffectActive('delay')) return 0;
  return clamp01(
    a.delay?.wet?.value ??
    a.delay?._lastWet ??
    0,
    0
  );
}

function getChorusWet() {
  const a = getAudioModule();
  if (!isEffectActive('chorus')) return 0;
  return clamp01(
    a.chorus?.wet?.value ??
    a.chorus?._lastWet ??
    0,
    0
  );
}

function buildState() {
  return {
    type: 'synth_state',
    scale: getScale(),
    key: getKey(),
    reverb: getReverbWet(),
    distortion: getDistortionWet(),
    delay: getDelayWet(),
    chorus: getChorusWet(),
    ts: Date.now()
  };
}

function sameState(a, b) {
  if (!a || !b) return false;
  return (
    a.scale === b.scale &&
    a.key === b.key &&
    Math.abs(a.reverb - b.reverb) < 0.0001 &&
    Math.abs(a.distortion - b.distortion) < 0.0001 &&
    Math.abs(a.delay - b.delay) < 0.0001 &&
    Math.abs(a.chorus - b.chorus) < 0.0001
  );
}

export function initLivePlantingSync(options = {}) {
  const wsUrl = options.wsUrl || DEFAULT_WS_URL;
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;

  let socket = null;
  let intervalId = null;
  let reconnectTimeout = null;
  let stopped = false;
  let lastState = null;

  const sendCurrentState = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const state = buildState();
    if (sameState(state, lastState)) return;
    socket.send(JSON.stringify(state));
    lastState = state;
    console.log('[LivePlantingSync] sent', state);
  };

  const bindDomEvents = () => {
    const ids = [
      'rootNoteSelect',
      'scaleSelect',
      'reverbMixKnob',
      'distortionMixKnob',
      'delayMixKnob',
      'reverbDecayKnob',
      'reverbSizeKnob',
      'distortionDriveKnob',
      'distortionToneKnob',
      'chorusDepthKnob',
      'chorusRateKnob',
      'chorusMixKnob',
      'delayTimeKnob',
      'delayFeedbackKnob'
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      ['input', 'change', 'click', 'pointerup', 'mouseup', 'touchend'].forEach((evt) => {
        el.addEventListener(evt, () => setTimeout(sendCurrentState, 0));
      });
    });

    document.querySelectorAll('[data-effect]').forEach((el) => {
      el.addEventListener('click', () => setTimeout(sendCurrentState, 0));
    });
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimeout) return;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = () => {
    if (stopped) return;

    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[LivePlantingSync] websocket init failed', err);
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      console.log('[LivePlantingSync] connected', wsUrl);
      sendCurrentState();
    });

    socket.addEventListener('close', () => {
      console.warn('[LivePlantingSync] disconnected');
      socket = null;
      scheduleReconnect();
    });

    socket.addEventListener('error', (err) => {
      console.warn('[LivePlantingSync] websocket error', err);
    });
  };

  bindDomEvents();
  connect();
  intervalId = window.setInterval(sendCurrentState, intervalMs);

  return {
    forceSync: sendCurrentState,
    stop() {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      try { socket?.close(); } catch (_) {}
      socket = null;
    }
  };
}
