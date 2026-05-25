export let toneSynth = null;
export let fftAnalyser = null;
export let audioFilter = null;
export let mainLimiter = null;
export let mainCompressor = null;
export let masterVolume = null;
export let solarSenderSocket = null;
export let solarSenderTapNode = null;
export let solarSenderTapGain = null;
export let solarSenderTapStarted = false;
export let toneStarted = false;
export let lastPlayedMidi = null;
export let lastPlayTime = 0;

import { setupEffectKnob as uiSetupEffectKnob } from './ui.js';
const setupEffectKnob = uiSetupEffectKnob;

export function setLastPlayedMidi(midi) {
    lastPlayedMidi = midi;
}

export function setLastPlayTime(time) {
    lastPlayTime = time;
}
export const playCooldown = 150;
export let samplePlayer = null;
export let sampleLoadedName = null;
export const MAX_POLYPHONY = 8;
export const activeSampleVoices = [];
export let outputMeter = null;
export let meterAnimationId = null;
export const VOLUME_MIN = -40;
export const VOLUME_MAX = 6;
export let currentVolumeDb = 0;
export const SNAP_THRESHOLD = 0.3;
export let metronomeEnabled = false;
export let metronomeOsc = null;
export let metronomePanner = null;
export let metronomeVolume = null;

export let reverb = null;
export let distortion = null;
export let chorus = null;
let chorusStarted = false;
export let delay = null;
export let distortionDriveValue = 0;
export let distortionToneFactor = 1;
let delayTimePending = null;
let delayTimeTimer = null;

export let audioRoutingInitialized = false;
export let effectsInputNode = null;
export let effectsOutputNode = null;

let solarSenderTapNodeRaw = null;
let solarSenderTapDestination = null;
let solarSenderTapMutedGain = null;
let solarSenderTapInitPromise = null;
let _toneDiagLastStage = '';
let _toneStartPromise = null;

export const audioState = {
    eqEnabled: false,
    eqHighpassFreq: 20,
    eqLowpassFreq: 20000,
    eqHighpassQ: 0.7071,
    eqLowpassQ: 0.7071,
    eqHighpassRolloff: -12,
    eqLowpassRolloff: -12,
    eqHighpassFilter: null,
    eqLowpassFilter: null,
    eqDraggingFilter: null,
    midiEnabled: false
};

export let eqEnabled = false;
export let eqHighpassFreq = 20;
export let eqLowpassFreq = 20000;
export let eqHighpassQ = 0.7071;
export let eqLowpassQ = 0.7071;
export let eqHighpassRolloff = -12;
export let eqLowpassRolloff = -12;
export let eqHighpassFilter = null;
export let eqLowpassFilter = null;
export let eqDraggingFilter = null;

export const EQ_MIN_FREQ = 20;
export const EQ_MAX_FREQ = 20000;
export const EQ_MIN_Q = 0.1;
export const EQ_MAX_Q = 20;
export const EQ_VALID_ROLLOFFS = [-12, -24, -48, -96];

export const PRESET_SAMPLES = {
    afterglow: 'Sounds/afterglow.wav',
    ember: 'Sounds/ember.wav',
    kelvin: 'Sounds/kelvin.wav',
    lumen: 'Sounds/lumen.wav',
    parsec: 'Sounds/parsec.wav',
    photon: 'Sounds/photon.wav',
    halo: 'Sounds/halo.wav'
};

export function syncAudioState() {
    audioState.eqEnabled = eqEnabled;
    audioState.eqHighpassFreq = eqHighpassFreq;
    audioState.eqLowpassFreq = eqLowpassFreq;
    audioState.eqHighpassQ = eqHighpassQ;
    audioState.eqLowpassQ = eqLowpassQ;
    audioState.eqHighpassRolloff = eqHighpassRolloff;
    audioState.eqLowpassRolloff = eqLowpassRolloff;
    audioState.eqHighpassFilter = eqHighpassFilter;
    audioState.eqLowpassFilter = eqLowpassFilter;
}

export function setEQHighpassFreq(freq) {
    eqHighpassFreq = freq;
    audioState.eqHighpassFreq = freq;
    if (eqEnabled && eqHighpassFilter) {
        eqHighpassFilter.frequency.rampTo(freq, 0.05);
    }
}

export function setEQLowpassFreq(freq) {
    eqLowpassFreq = freq;
    audioState.eqLowpassFreq = freq;
    if (eqEnabled && eqLowpassFilter) {
        eqLowpassFilter.frequency.rampTo(freq, 0.05);
    }
}

export function setEQHighpassRolloff(rolloff) {
    eqHighpassRolloff = rolloff;
    audioState.eqHighpassRolloff = rolloff;
    if (eqEnabled && eqHighpassFilter) {
        eqHighpassFilter.rolloff = rolloff;
    }
}

export function setEQLowpassRolloff(rolloff) {
    eqLowpassRolloff = rolloff;
    audioState.eqLowpassRolloff = rolloff;
    if (eqEnabled && eqLowpassFilter) {
        eqLowpassFilter.rolloff = rolloff;
    }
}

function logToneDiagnostics(stage) {
    if (_toneDiagLastStage === stage) return;
    _toneDiagLastStage = stage;

    const hasTone = typeof Tone !== 'undefined';
    const hasStart = hasTone && typeof Tone.start === 'function';
    const hasGetContext = hasTone && typeof Tone.getContext === 'function';
    const toneContext = hasGetContext ? Tone.getContext() : null;
    const rawContext = toneContext
        ? (toneContext.rawContext || toneContext._nativeContext || toneContext._nativeAudioContext || null)
        : null;

    console.info('[Solar][ToneDiag]', {
        stage,
        hasTone,
        hasStart,
        hasGetContext,
        toneStarted,
        contextState: rawContext && typeof rawContext.state === 'string' ? rawContext.state : null,
        contextCtor: rawContext && rawContext.constructor ? rawContext.constructor.name : null,
    });
}

function isToneContextRunning() {
    if (typeof Tone === 'undefined' || typeof Tone.getContext !== 'function') return false;
    const toneCtx = Tone.getContext();
    const rawContext = toneCtx
        ? (toneCtx.rawContext || toneCtx._nativeContext || toneCtx._nativeAudioContext || null)
        : null;
    return !!(rawContext && rawContext.state === 'running');
}

export function ensureToneStarted() {
    try {
        if (typeof Tone === 'undefined') {
            console.warn('[Solar][ToneDiag] Tone is undefined. Check Tone script load order.');
            return;
        }

        logToneDiagnostics('ensureToneStarted:enter');

        if (!mainLimiter) {
            mainLimiter = new Tone.Limiter(-2).toDestination();
            mainCompressor = new Tone.Compressor({
                threshold: -20,
                ratio: 4,
                attack: 0.01,
                release: 0.1
            }).connect(mainLimiter);
            masterVolume = new Tone.Volume(-Infinity).connect(mainCompressor);
        }

        if (!outputMeter && masterVolume) {
            outputMeter = new Tone.Meter({ normalRange: false });
            masterVolume.connect(outputMeter);
        }

        if (!toneSynth) {
            toneSynth = new Tone.Synth({ oscillator: { type: 'sine' } }).connect(masterVolume);
        }

        if (!fftAnalyser && masterVolume) {
            fftAnalyser = new Tone.FFT(512);
            masterVolume.connect(fftAnalyser);

            import('./spectrum.js').then(spectrumModule => {
                spectrumModule.initSpectrum(fftAnalyser);
            }).catch(e => console.warn('Failed to init spectrum:', e));
        }

        if (!toneStarted && isToneContextRunning()) {
            toneStarted = true;
            logToneDiagnostics('ensureToneStarted:context-already-running');
        }

        if (!toneStarted) {
            if (typeof Tone.start !== 'function') {
                console.warn('[Solar][ToneDiag] Tone.start is not a function.');
                logToneDiagnostics('ensureToneStarted:missing-start');
            } else if (!_toneStartPromise) {
                _toneStartPromise = Promise.resolve()
                    .then(() => Tone.start())
                    .then(() => {
                        toneStarted = isToneContextRunning() || true;
                        logToneDiagnostics('Tone.start:resolved');
                        if (masterVolume) {
                            masterVolume.volume.rampTo(currentVolumeDb, 1.5);
                        }
                        return startSolarSenderTap().catch(e => {
                            console.warn('Failed to start solar sender tap', e);
                        });
                    })
                    .catch(e => {
                        console.warn('Tone.start failed:', e);
                        logToneDiagnostics('Tone.start:rejected');
                    })
                    .finally(() => {
                        _toneStartPromise = null;
                    });
            }
        } else {
            logToneDiagnostics('ensureToneStarted:already-started');
            startSolarSenderTap().catch(e => console.warn('Failed to start solar sender tap', e));
        }

        if (!metronomeOsc) {
            initMetronome();
        }
    } catch (e) {
        console.warn('Tone.js not available or failed to start', e);
    }
}

let _solarReconnectTimer = null;

function ensureSolarSocket() {
    if (
        solarSenderSocket &&
        (solarSenderSocket.readyState === WebSocket.OPEN ||
            solarSenderSocket.readyState === WebSocket.CONNECTING)
    ) {
        return solarSenderSocket;
    }

    solarSenderSocket = new WebSocket('ws://127.0.0.1:8080/solar');
    solarSenderSocket.binaryType = 'arraybuffer';
    solarSenderSocket.onopen = () => {
        console.log('[Solar] WebSocket connected to bridge.py');
        if (_solarReconnectTimer) {
            clearTimeout(_solarReconnectTimer);
            _solarReconnectTimer = null;
        }
    };
    solarSenderSocket.onclose = () => {
        console.warn('[Solar] WebSocket closed, reconnecting in 2s...');
        _solarReconnectTimer = setTimeout(() => ensureSolarSocket(), 2000);
    };
    solarSenderSocket.onerror = (e) => console.warn('[Solar] WebSocket error', e);
    return solarSenderSocket;
}

function startSolarSocketLoop() {
    ensureSolarSocket();
}

function resolveNativeAudioContext(ctxLike) {
    if (!ctxLike) return null;

    const AudioCtx = globalThis.AudioContext;
    const OfflineCtx = globalThis.OfflineAudioContext;
    const queue = [ctxLike];
    const seen = new Set();
    const nestedKeys = [
        '_nativeContext',
        '_nativeAudioContext',
        '_nativeEventTarget',
        'rawContext',
        'context',
        '_context',
    ];

    while (queue.length > 0) {
        const c = queue.shift();
        if (!c || typeof c !== 'object') continue;
        if (seen.has(c)) continue;
        seen.add(c);

        try {
            if (AudioCtx && c instanceof AudioCtx) return c;
            if (OfflineCtx && c instanceof OfflineCtx) return c;
        } catch (_) {}

        for (const k of nestedKeys) {
            try {
                const n = c[k];
                if (n && typeof n === 'object' && !seen.has(n)) {
                    queue.push(n);
                }
            } catch (_) {}
        }
    }

    return null;
}

function resolveNativeAudioNode(nodeLike, targetContext = null) {
    if (!nodeLike) return null;

    const AudioNodeCtor = globalThis.AudioNode;
    const queue = [nodeLike];
    const seen = new Set();
    const nestedKeys = [
        // Tone.js 14+ internals
        '_gainNode',         // Tone.Volume / Tone.Gain wrap a GainNode here
        '_nativeAudioNode',  // some ToneAudioNode versions expose it here
        '_nativeNode',
        '_node',
        '_internalNode',
        // Standard ToneAudioNode interface
        'input',
        'output',
        '_input',
        '_output',
        '_source',
        '_gain',
        'context',
    ];

    while (queue.length > 0) {
        const n = queue.shift();
        if (!n || (typeof n !== 'object' && typeof n !== 'function')) continue;
        if (seen.has(n)) continue;
        seen.add(n);

        const looksLikeAudioNode = AudioNodeCtor
            ? n instanceof AudioNodeCtor
            : typeof n.connect === 'function' && 'context' in n;

        if (looksLikeAudioNode) {
            if (!targetContext || n.context === targetContext) {
                return n;
            }
        }

        for (const k of nestedKeys) {
            try {
                const child = n[k];
                if (child && (typeof child === 'object' || typeof child === 'function') && !seen.has(child)) {
                    queue.push(child);
                }
            } catch (_) {}
        }
    }

    return null;
}

let _pcmWorkletModuleLoaded = false;

async function createSolarSenderWorklet(ctx) {
    const workletSource = `
class PcmSenderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkFrames = 960;
    this.left = new Float32Array(this.chunkFrames);
    this.right = new Float32Array(this.chunkFrames);
    this.index = 0;
  }

  flush() {
    if (this.index === 0) return;
    const pcm = new Int16Array(this.index * 2);
    for (let i = 0; i < this.index; i++) {
      const l = Math.max(-1, Math.min(1, this.left[i] || 0));
      const r = Math.max(-1, Math.min(1, this.right[i] || 0));
      pcm[i * 2]     = l < 0 ? l * 32768 : l * 32767;
      pcm[i * 2 + 1] = r < 0 ? r * 32768 : r * 32767;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    this.index = 0;
  }

  process(inputs, outputs) {
    const input  = inputs[0];
    const output = outputs[0];

    if (output && output.length > 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
    }

    if (!input || input.length === 0) return true;

    const leftIn  = input[0];
    const rightIn = input[1] || input[0];
    if (!leftIn) return true;

    for (let i = 0; i < leftIn.length; i++) {
      this.left[this.index]  = leftIn[i];
      this.right[this.index] = rightIn ? rightIn[i] : leftIn[i];
      this.index++;
      if (this.index >= this.chunkFrames) {
        this.flush();
      }
    }
    return true;
  }
}
try {
    registerProcessor('pcm-sender-processor', PcmSenderProcessor);
} catch (e) {
    const msg = (e && e.message) ? String(e.message) : '';
    if (!(e && e.name === 'NotSupportedError') && !msg.includes('already registered')) {
        throw e;
    }
}
`;

    if (!_pcmWorkletModuleLoaded) {
        const blob = new Blob([workletSource], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);
        try {
            await ctx.audioWorklet.addModule(moduleUrl);
            _pcmWorkletModuleLoaded = true;
        } finally {
            URL.revokeObjectURL(moduleUrl);
        }
    }

    return new AudioWorkletNode(ctx, 'pcm-sender-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
    });
}

export async function startSolarSenderTap() {
    if (solarSenderTapStarted) return;
    if (solarSenderTapInitPromise) return solarSenderTapInitPromise;

    solarSenderTapInitPromise = (async () => {
        const tap_log  = (stage, data) => console.info(`[Solar][Tap] ${stage}`, data ?? '');
        const tap_fail = (stage, err) => {
            console.error(`[Solar][Tap] ❌ FAILED at stage: "${stage}"`, err);
            console.error(`[Solar][Tap]    name=${err?.name}  message=${err?.message}`);
        };

        try {
            tap_log('1 – check Tone');
            if (typeof Tone === 'undefined' || !Tone.getContext) {
                tap_log('abort: Tone not ready'); return;
            }
            if (!masterVolume) {
                tap_log('abort: masterVolume is null'); return;
            }

            tap_log('2 – resolve AudioContext');
            const toneCtx = Tone.getContext();
            const ctx = resolveNativeAudioContext(toneCtx?.rawContext || toneCtx);
            tap_log('2 – resolved ctx', { state: ctx?.state, ctor: ctx?.constructor?.name });
            if (!ctx) { tap_log('abort: ctx is null'); return; }

            tap_log('3 – ensureSolarSocket');
            ensureSolarSocket();

            if (ctx.audioWorklet) {
                tap_log('4a – trying AudioWorklet');
                try {
                    solarSenderTapNodeRaw = await createSolarSenderWorklet(ctx);
                    tap_log('4a – AudioWorklet created OK');
                    solarSenderTapNodeRaw.port.onmessage = (event) => {
                        const socket = ensureSolarSocket();
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(event.data);
                        }
                    };
                } catch (workletErr) {
                    tap_fail('4a – AudioWorklet creation', workletErr);
                    solarSenderTapNodeRaw = null;
                }
            } else {
                tap_log('4a – audioWorklet not available, will use ScriptProcessor');
            }

            if (!solarSenderTapNodeRaw) {
                if (ctx.createScriptProcessor) {
                    tap_log('4b – creating ScriptProcessorNode');
                    try {
                        const node = ctx.createScriptProcessor(1024, 2, 2);
                        node.onaudioprocess = (e) => {
                            const socket = ensureSolarSocket();
                            if (socket.readyState !== WebSocket.OPEN) return;
                            const ch0 = e.inputBuffer.getChannelData(0);
                            const ch1 = e.inputBuffer.numberOfChannels > 1
                                ? e.inputBuffer.getChannelData(1) : ch0;
                            const pcm = new Int16Array(ch0.length * 2);
                            for (let i = 0; i < ch0.length; i++) {
                                const l = Math.max(-1, Math.min(1, ch0[i]));
                                const r = Math.max(-1, Math.min(1, ch1[i]));
                                pcm[i * 2]     = l < 0 ? l * 32768 : l * 32767;
                                pcm[i * 2 + 1] = r < 0 ? r * 32768 : r * 32767;
                            }
                            socket.send(pcm.buffer);
                        };
                        solarSenderTapNodeRaw = node;
                        tap_log('4b – ScriptProcessorNode created OK');
                    } catch (spErr) {
                        tap_fail('4b – ScriptProcessorNode creation', spErr);
                        return;
                    }
                } else {
                    tap_log('abort: no AudioWorklet and no createScriptProcessor');
                    return;
                }
            }

            tap_log('5 – creating gain nodes');
            solarSenderTapDestination = ctx.createGain();
            solarSenderTapDestination.gain.value = 0.0001;

            solarSenderTapMutedGain = ctx.createGain();
            solarSenderTapMutedGain.gain.value = 0.0001;

            const tapBridgeGain = ctx.createGain();
            tapBridgeGain.gain.value = 1.0;

            // masterVolume is a Tone.js node — its .connect() only accepts other Tone nodes.
            // tapBridgeGain is a native Web Audio GainNode, so we must resolve the
            // underlying native AudioNode first and use the native .connect() API.
            tap_log('6 – resolving native node of masterVolume');
            // Diagnostic: dump accessible keys on masterVolume so we can see Tone's internals
            try {
                const mvDump = {};
                // Own enumerable + non-enumerable keys
                const allKeys = [
                    ...Object.keys(masterVolume),
                    ...Object.getOwnPropertyNames(masterVolume),
                    ...Object.getOwnPropertyNames(Object.getPrototypeOf(masterVolume) ?? {})
                ];
                for (const k of [...new Set(allKeys)]) {
                    try { mvDump[k] = typeof masterVolume[k]; } catch (_) { mvDump[k] = '(throws)'; }
                }
                tap_log('6 – masterVolume property map', mvDump);
            } catch (dumpErr) {
                tap_log('6 – masterVolume dump failed', dumpErr?.message);
            }
            const nativeMasterVolume = resolveNativeAudioNode(masterVolume, ctx);
            tap_log('6 – resolved', {
                found: !!nativeMasterVolume,
                ctor: nativeMasterVolume?.constructor?.name,
                sameCtx: nativeMasterVolume?.context === ctx
            });
            if (!nativeMasterVolume) {
                tap_fail('6', new Error('Could not resolve native AudioNode for masterVolume'));
                return;
            }
            tap_log('6b – nativeMasterVolume.connect(tapBridgeGain)');
            nativeMasterVolume.connect(tapBridgeGain);

            tap_log('7 – tapBridgeGain.connect(solarSenderTapNodeRaw)');
            tapBridgeGain.connect(solarSenderTapNodeRaw);

            tap_log('8 – solarSenderTapNodeRaw.connect(solarSenderTapDestination)');
            solarSenderTapNodeRaw.connect(solarSenderTapDestination);

            tap_log('9 – solarSenderTapDestination.connect(solarSenderTapMutedGain)');
            solarSenderTapDestination.connect(solarSenderTapMutedGain);

            tap_log('10 – solarSenderTapMutedGain.connect(ctx.destination)');
            solarSenderTapMutedGain.connect(ctx.destination);

            solarSenderTapNode    = solarSenderTapNodeRaw;
            solarSenderTapGain    = solarSenderTapMutedGain;
            solarSenderTapStarted = true;
            tap_log('✅ Solar sender tap started successfully');

        } catch (outerErr) {
            tap_fail('OUTER (unexpected)', outerErr);
        }
    })();

    try {
        await solarSenderTapInitPromise;
    } finally {
        solarSenderTapInitPromise = null;
    }
}

export function setMasterVolume(volumeDb) {
    ensureToneStarted();
    const clamped = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volumeDb));
    currentVolumeDb = clamped;
    if (masterVolume) masterVolume.volume.rampTo(clamped, 0.1);
}

export function initMetronome() {
    try {
        metronomeVolume = new Tone.Volume(-10).toDestination();
        metronomePanner = new Tone.Panner(0).connect(metronomeVolume);

        metronomeOsc = new Tone.MembraneSynth({
            pitchDecay: 0.01,
            octaves: 1,
            oscillator: { type: 'sine' },
            envelope: {
                attack: 0.001,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            }
        }).connect(metronomePanner);

        Tone.Transport.scheduleRepeat((time) => {
            if (metronomeEnabled) {
                const position = Tone.Transport.position.split(':');
                const quarter = parseInt(position[1]);

                if (quarter === 0) {
                    metronomeOsc.triggerAttackRelease('G6', '32n', time, 1);
                } else {
                    metronomeOsc.triggerAttackRelease('C6', '32n', time, 0.6);
                }
            }
        }, '4n');

        console.log('Metronome initialized');
    } catch (e) {
        console.warn('Failed to initialize metronome', e);
    }
}

export function updateMetronomeBPM(bpm) {
    try {
        if (typeof Tone !== 'undefined' && Tone.Transport) {
            Tone.Transport.bpm.value = bpm;
        }
    } catch (e) {
        console.warn('Failed to update metronome BPM', e);
    }
}

export async function loadSampleFromUrl(url, rootMidi = 60, name = null) {
    try {
        if (typeof Tone === 'undefined') throw new Error('Tone.js required');
        ensureToneStarted();

        if (samplePlayer) {
            try { samplePlayer.dispose(); } catch (e) {}
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        const toneCtx = Tone.getContext();
        const audioContext = resolveNativeAudioContext(toneCtx?.rawContext || toneCtx);
        if (!audioContext) throw new Error('Unable to resolve native AudioContext');
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        samplePlayer = new Tone.Player({ onload: () => {} });
        samplePlayer.buffer.set(audioBuffer);

        const sampleRootMidi = Number(rootMidi) || 60;
        void sampleRootMidi;
        sampleLoadedName = name || url;
        return true;
    } catch (e) {
        console.warn('Failed to load sample', e);
        samplePlayer = null;
        sampleLoadedName = null;
        return false;
    }
}

export async function loadPresetSample(name) {
    const url = PRESET_SAMPLES[name];
    if (!url) return;

    await loadSampleFromUrl(url, 60, name);

    const status = document.getElementById('sampleStatus');
    if (status && name) {
        status.textContent = `Sample mode: Preset (${name})`;
    }
}

export function pickSampleFile(rootMidi = 60, fileInputEl = null) {
    const handleFile = async (f) => {
        if (!f) return;
        const url = URL.createObjectURL(f);
        const ok = await loadSampleFromUrl(url, rootMidi, f.name);
        if (ok) {
            const status = document.getElementById('sampleStatus');
            if (status) {
                status.textContent = `Sample mode: Manuale (${f.name})`;
            }
        }
    };

    if (fileInputEl) {
        fileInputEl.value = '';

        const file = fileInputEl.files && fileInputEl.files[0];
        if (file) return handleFile(file);

        fileInputEl.onchange = (ev) => {
            const f = ev.target.files && ev.target.files[0];
            handleFile(f);
        };
        fileInputEl.click();
        return;
    }

    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*';
    inp.onchange = async (ev) => {
        const f = ev.target.files && ev.target.files[0];
        await handleFile(f);
    };
    inp.click();
}

export function pruneSampleVoices() {
    while (activeSampleVoices.length >= MAX_POLYPHONY) {
        const old = activeSampleVoices.shift();
        try { old.stop(); } catch (e) {}
        try { old.dispose(); } catch (e) {}
    }
}

export function trackSampleVoice(player) {
    if (!player) return () => {};
    const cleanup = () => {
        const idx = activeSampleVoices.indexOf(player);
        if (idx !== -1) activeSampleVoices.splice(idx, 1);
    };
    player.onstop = cleanup;
    activeSampleVoices.push(player);
    return cleanup;
}

export function playSampleAtMidi(midi, time) {
    try {
        if (!samplePlayer || !samplePlayer.buffer) {
            console.warn('No sample loaded or buffer missing');
            return false;
        }

        if (!audioRoutingInitialized) {
            initializeAudioChain();
        }

        const root = 60;
        const semitoneShift = midi - root;

        ensureToneStarted();
        pruneSampleVoices();

        const temp = new Tone.Player(samplePlayer.buffer);
        const cleanup = trackSampleVoice(temp);

        temp.connect(effectsInputNode);
        temp.volume.value = -4;

        const playbackRate = Math.pow(2, semitoneShift / 12);
        if (
            temp.playbackRate instanceof Tone.Signal ||
            (temp.playbackRate && typeof temp.playbackRate.value !== 'undefined')
        ) {
            temp.playbackRate.value = playbackRate;
        } else {
            temp.playbackRate = playbackRate;
        }

        if (time) {
            temp.start(time);
        } else {
            temp.start();
        }

        setTimeout(() => {
            try { temp.stop(); } catch (e) {}
            try { temp.dispose(); } catch (e) {}
            cleanup();
        }, (samplePlayer.buffer.duration / playbackRate + 0.5) * 1000);

        return true;
    } catch (e) {
        console.warn('Sample play failed', e);
        return false;
    }
}

export function initializeAudioChain() {
    if (audioRoutingInitialized) return;

    try {
        ensureToneStarted();

        reverb      = new Tone.Reverb({ decay: 1.5, wet: 0 });
        distortion  = new Tone.Distortion({ distortion: 0, wet: 0 });
        chorus      = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0 });
        delay       = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.5, wet: 0 });

        if (!eqHighpassFilter) {
            eqHighpassFilter = new Tone.Filter({
                type: 'highpass',
                frequency: eqHighpassFreq,
                rolloff: eqHighpassRolloff,
                Q: eqHighpassQ
            });
        }

        if (!eqLowpassFilter) {
            eqLowpassFilter = new Tone.Filter({
                type: 'lowpass',
                frequency: eqLowpassFreq,
                rolloff: eqLowpassRolloff,
                Q: eqLowpassQ
            });
        }

        delay.chain(chorus, distortion, reverb, eqHighpassFilter, eqLowpassFilter, masterVolume);

        effectsInputNode  = delay;
        effectsOutputNode = masterVolume;

        audioRoutingInitialized = true;
        console.log('Audio chain initialized');
    } catch (e) {
        console.error('Failed to initialize audio chain:', e);
    }
}

export function setEQEnabled(enabled) {
    eqEnabled = enabled;
    audioState.eqEnabled = enabled;

    if (eqHighpassFilter && eqLowpassFilter) {
        if (enabled) {
            eqHighpassFilter.frequency.rampTo(eqHighpassFreq, 0.05);
            eqLowpassFilter.frequency.rampTo(eqLowpassFreq, 0.05);
        } else {
            eqHighpassFilter.frequency.rampTo(20, 0.05);
            eqLowpassFilter.frequency.rampTo(20000, 0.05);
        }
    }

    console.log(`EQ ${enabled ? 'enabled' : 'disabled'}`);
}

export function setMetronomeEnabled(enabled) {
    metronomeEnabled = enabled;
}

export function createEQFilters() {
    if (!eqHighpassFilter) {
        eqHighpassFilter = new Tone.Filter({
            type: 'highpass',
            frequency: eqHighpassFreq,
            rolloff: eqHighpassRolloff,
            Q: eqHighpassQ
        });
        if (masterVolume) eqHighpassFilter.connect(masterVolume);
        audioState.eqHighpassFilter = eqHighpassFilter;
    }

    if (!eqLowpassFilter) {
        eqLowpassFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: eqLowpassFreq,
            rolloff: eqLowpassRolloff,
            Q: eqLowpassQ
        });
        if (eqHighpassFilter) eqLowpassFilter.connect(eqHighpassFilter);
        audioState.eqLowpassFilter = eqLowpassFilter;
    }
}

function startDbMeterLoop() {
    if (meterAnimationId) return;

    const loop = () => {
        const fill = document.getElementById('dbMeterFill');
        if (!fill || !outputMeter) {
            meterAnimationId = null;
            return;
        }
        let level = outputMeter.getValue();
        if (!Number.isFinite(level)) level = -60;
        const clamped = Math.max(-60, Math.min(0, level));
        const pct = Math.max(0, Math.min(1, (clamped + 60) / 60));
        fill.style.width = `${pct * 100}%`;
        let color = '#22c55e';
        if (level > -3 && level <= 0) color = '#fbbf24';
        else if (level > 0) color = '#ef4444';
        fill.style.background = color;
        meterAnimationId = requestAnimationFrame(loop);
    };

    meterAnimationId = requestAnimationFrame(loop);
}

function updateDbReadout(volumeDb) {
    const readout = document.getElementById('dbReadout');
    if (!readout) return;
    const val = volumeDb === 0 ? '0' : volumeDb.toFixed(1);
    readout.textContent = `${val} dB`;
}

function attachVolumeSlider() {
    const thumb  = document.getElementById('volumeThumb');
    const slider = document.querySelector('.volume-slider');
    if (!thumb || !slider) return;

    const updateThumb = (volumeDb) => {
        const pct = (volumeDb - VOLUME_MIN) / (VOLUME_MAX - VOLUME_MIN);
        thumb.style.left = `${pct * 100}%`;
    };

    const applyVolumeFromEvent = (evt) => {
        const rect = slider.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        let volumeDb = VOLUME_MIN + pct * (VOLUME_MAX - VOLUME_MIN);
        if (Math.abs(volumeDb) < SNAP_THRESHOLD) volumeDb = 0;
        const rounded = Math.round(volumeDb * 10) / 10;
        updateThumb(rounded);
        setMasterVolume(rounded);
        updateDbReadout(rounded);
    };

    updateThumb(currentVolumeDb);
    setMasterVolume(currentVolumeDb);
    updateDbReadout(currentVolumeDb);

    let dragging = false;

    const resetToZero = (evt) => {
        setMasterVolume(0);
        updateThumb(0);
        updateDbReadout(0);
        evt.preventDefault();
    };

    thumb.addEventListener('dblclick', resetToZero);
    slider.addEventListener('dblclick', resetToZero);

    const startDrag = (evt) => {
        dragging = true;
        document.body.style.cursor = 'ew-resize';
        applyVolumeFromEvent(evt);
        evt.preventDefault();
    };

    const moveDrag = (evt) => {
        if (!dragging) return;
        applyVolumeFromEvent(evt);
    };

    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = 'default';
    };

    slider.addEventListener('mousedown', startDrag);
    thumb.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('mouseup', endDrag);
}

function setupEffectToggle(effectName) {
    const toggleBtns = document.querySelectorAll(`[data-effect="${effectName}"]`);

    toggleBtns.forEach(btn => {
        btn.textContent = 'OFF';
        btn.classList.remove('active');

        btn.addEventListener('click', () => {
            if (effectName === 'eq') {
                eqEnabled = !eqEnabled;
                audioState.eqEnabled = eqEnabled;
                if (eqEnabled) {
                    btn.classList.add('active');
                    btn.textContent = 'ON';
                } else {
                    btn.classList.remove('active');
                    btn.textContent = 'OFF';
                }
                setEQEnabled(eqEnabled);
                return;
            }
            const effectNode = getEffectNode(effectName);
            if (!effectNode) return;
            const isActive = btn.classList.contains('active');
            if (isActive) {
                btn.classList.remove('active');
                btn.textContent = 'OFF';
                if (effectNode._lastWet !== undefined) {
                    effectNode._lastWet = effectNode.wet.value;
                }
                if (effectName === 'chorus') ensureChorusStarted();
                if (effectName === 'chorus') smoothWet(effectNode, 0, 0.05);
                else effectNode.wet.value = 0;
            } else {
                btn.classList.add('active');
                btn.textContent = 'ON';
                const lastWet = effectNode._lastWet !== undefined ? effectNode._lastWet : 0.5;
                if (effectName === 'chorus') ensureChorusStarted();
                if (effectName === 'chorus') smoothWet(effectNode, lastWet, 0.05);
                else effectNode.wet.value = lastWet;
            }
        });
    });
}

function getEffectNode(effectName) {
    switch (effectName) {
        case 'distortion': return distortion;
        case 'chorus':     return chorus;
        case 'delay':      return delay;
        case 'reverb':     return reverb;
        default:           return null;
    }
}

function applyDelayTime(target) {
    if (!delay) return;
    const quantized = Math.round((target * 1000) / 10) * 10 / 1000;
    try {
        if (typeof delay.delayTime.setValueAtTime === 'function' && typeof Tone !== 'undefined' && Tone.now) {
            delay.delayTime.setValueAtTime(quantized, Tone.now());
        } else {
            delay.delayTime.value = quantized;
        }
    } catch (e) {
        try { delay.delayTime.value = quantized; } catch (_) {}
    }
}

function flushDelayTimePending() {
    if (delayTimeTimer) {
        clearTimeout(delayTimeTimer);
        delayTimeTimer = null;
    }
    if (delayTimePending == null) return;
    applyDelayTime(delayTimePending);
    delayTimePending = null;
}

function smoothWet(node, target, ramp = 0.05) {
    if (!node || !node.wet) return;
    try {
        if (typeof node.wet.rampTo === 'function') {
            node.wet.rampTo(target, ramp);
            return;
        }
    } catch (e) {}
    try { node.wet.value = target; } catch (e) {}
}

function ensureChorusStarted() {
    try {
        if (!chorus || typeof chorus.start !== 'function') return;
        if (chorusStarted) return;
        chorus.start();
        chorusStarted = true;
    } catch (e) {
        console.warn('Unable to start chorus LFO', e);
    }
}

export async function initAudioUI() {
    startSolarSocketLoop();
    ensureToneStarted();
    initializeAudioChain();
    syncAudioState();

    if (outputMeter) {
        console.log('Starting dB meter loop');
        startDbMeterLoop();
    }

    attachVolumeSlider();

    setupEffectToggle('distortion');
    setupEffectToggle('chorus');
    setupEffectToggle('delay');
    setupEffectToggle('reverb');
    setupEffectToggle('eq');

    setupEffectKnob('distortionDriveKnob', (value) => {
        distortionDriveValue = value;
        if (distortion) {
            const amt = Math.min(1, Math.max(0, distortionDriveValue * distortionToneFactor));
            distortion.distortion = amt;
        }
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('distortionToneKnob', (value) => {
        distortionToneFactor = 0.5 + value * 0.5;
        if (distortion) {
            const amt = Math.min(1, Math.max(0, distortionDriveValue * distortionToneFactor));
            distortion.distortion = amt;
        }
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('distortionMixKnob', (value) => {
        if (distortion) {
            distortion._lastWet = value;
            const btn = document.querySelector('[data-effect="distortion"]');
            if (btn && btn.classList.contains('active')) {
                distortion.wet.value = value;
            }
        }
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('chorusDepthKnob', (value) => {
        ensureChorusStarted();
        if (chorus) chorus.depth = value;
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('chorusRateKnob', (value) => {
        ensureChorusStarted();
        if (chorus) chorus.frequency.value = 0.5 + value * 4.5;
    }, 0, (v) => `${(0.5 + v * 4.5).toFixed(2)} Hz`);

    setupEffectKnob('chorusMixKnob', (value) => {
        if (chorus) {
            chorus._lastWet = value;
            ensureChorusStarted();
            const btn = document.querySelector('[data-effect="chorus"]');
            if (btn && btn.classList.contains('active')) {
                smoothWet(chorus, value, 0.05);
            }
        }
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('delayTimeKnob', (value) => {
        if (!delay) return;
        delayTimePending = 0.01 + value * 0.99;
        if (delayTimeTimer) clearTimeout(delayTimeTimer);
        delayTimeTimer = setTimeout(flushDelayTimePending, 120);
    }, 0, (v) => {
        const raw   = 0.01 + v * 0.99;
        const quant = Math.round((raw * 1000) / 10) * 10 / 1000;
        return `${(quant * 1000).toFixed(0)} ms`;
    });

    setupEffectKnob('delayFeedbackKnob', (value) => {
        if (delay) delay.feedback.value = value * 0.95;
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('delayMixKnob', (value) => {
        if (delay) {
            delay._lastWet = value;
            const btn = document.querySelector('[data-effect="delay"]');
            if (btn && btn.classList.contains('active')) {
                delay.wet.value = value;
            }
        }
    }, 0, (v) => `${Math.round(v * 100)}%`);

    document.addEventListener('mouseup', flushDelayTimePending);

    setupEffectKnob('reverbDecayKnob', (value) => {
        if (reverb) reverb.decay = 0.1 + value * 9.9;
    }, 0, (v) => `${(0.1 + v * 9.9).toFixed(1)}s`);

    setupEffectKnob('reverbMixKnob', (value) => {
        if (reverb) {
            reverb._lastWet = value;
            const btn = document.querySelector('[data-effect="reverb"]');
            if (btn && btn.classList.contains('active')) {
                reverb.wet.value = value;
            }
        }
    }, 0, (v) => `${Math.round(v * 100)}%`);

    setupEffectKnob('reverbSizeKnob', (value) => {
        if (reverb) reverb.preDelay = value * 0.1;
    }, 0, (v) => `${Math.round(v * 100)}%`);

    const presetSelect = document.getElementById('presetSampleSelect');
    if (presetSelect) {
        presetSelect.addEventListener('change', async (e) => {
            const preset = e.target.value;
            console.log('Loading preset:', preset);
            await loadPresetSample(preset);
        });

        if (presetSelect.value) {
            loadPresetSample(presetSelect.value).catch(e =>
                console.warn('Failed to load default preset:', e)
            );
        }
    }

    console.log('✅ Audio UI initialized');
}