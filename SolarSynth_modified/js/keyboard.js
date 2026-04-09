export const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    naturalMinor: [0, 2, 3, 5, 7, 8, 10],
    majorPentatonic: [0, 2, 4, 7, 9],
    minorPentatonic: [0, 3, 5, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    none: [],
    custom: []
};

// Keyboard Model: represents all 88 keys (MIDI 21-108)
// Each entry tells us if it's white (0) or black (1), plus state tracking
function createKeyboardModel() {
    const model = [];
    // Pattern per octave: C(W), C#(B), D(W), D#(B), E(W), F(W), F#(B), G(W), G#(B), A(W), A#(B), B(W)
    const octavePattern = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    
    for (let midi = 21; midi <= 108; midi++) {
        const noteInOctave = midi % 12;
        model.push({
            midi: midi,
            isBlack: octavePattern[noteInOctave] === 1,
            isSelected: false,  // Track custom selection
            isScaleKey: false   // Track scale membership
        });
    }
    return model;
}

const keyboardModel = createKeyboardModel(); // 88 keys total with state tracking

export function getKeyboardModel() {
    return keyboardModel;
}

// Get key info by MIDI (useful for state tracking)
function getKeyInfoByMidi(midi) {
    return keyboardModel.find(k => k.midi === midi);
}

const KEYBOARD_BASE_SIZES = {
    keyHeight: 15,
    keyWidth: 66,
    whiteHeight: 10.5,
    whiteWidth: 65,
    blackHeight: 7,
    blackWidth: 62
};

const BASE_AVG_KEY_HEIGHT = (KEYBOARD_BASE_SIZES.whiteHeight * 7 + KEYBOARD_BASE_SIZES.blackHeight * 5) / 12;

// Track current visible MIDI range for quantization
let visibleMidiStart = 60;
let visibleMidiEnd = 95;

const MIDI_MIN = 21;
const MIDI_MAX = 108;
const MIN_VISIBLE_KEYS = 2;
const MAX_VISIBLE_KEYS = 88;

let currentStartMidi = 60;
let currentEndMidi = 95;
let currentKeyHeight = KEYBOARD_BASE_SIZES.keyHeight;

export function getVisibleMidiRange() {
    return { start: visibleMidiStart, end: visibleMidiEnd };
}

export function setVisibleMidiRange(start, end) {
    visibleMidiStart = start;
    visibleMidiEnd = end;
    console.log('Visible MIDI range updated:', visibleMidiStart, '-', visibleMidiEnd);
}

export function calculateKeyboardDimensions(startMidi, endMidi, zoom = 1) {
    const safeZoom = Number.isFinite(zoom) ? Math.max(0.01, zoom) : 1;
    const rangeStart = Math.min(startMidi, endMidi);
    const rangeEnd = Math.max(startMidi, endMidi);
    const keyCount = Math.max(0, rangeEnd - rangeStart + 1);

    const keyHeight = BASE_AVG_KEY_HEIGHT * safeZoom;
    const keyWidth = KEYBOARD_BASE_SIZES.keyWidth;
    const heightScale = keyHeight / BASE_AVG_KEY_HEIGHT;
    const whiteHeight = KEYBOARD_BASE_SIZES.whiteHeight * heightScale;
    const whiteWidth = KEYBOARD_BASE_SIZES.whiteWidth;
    const blackHeight = KEYBOARD_BASE_SIZES.blackHeight * heightScale;
    const blackWidth = KEYBOARD_BASE_SIZES.blackWidth;
    const totalHeight = keyCount * keyHeight;

    return {
        keyCount,
        keyHeight,
        keyWidth,
        whiteHeight,
        whiteWidth,
        blackHeight,
        blackWidth,
        totalHeight,
        zoom: safeZoom
    };
}

function clampRangeToMidi(start, end) {
    let rangeStart = Math.min(start, end);
    let rangeEnd = Math.max(start, end);
    const keyCount = rangeEnd - rangeStart + 1;

    if (keyCount >= (MIDI_MAX - MIDI_MIN + 1)) {
        return { start: MIDI_MIN, end: MIDI_MAX };
    }

    if (rangeStart < MIDI_MIN) {
        rangeStart = MIDI_MIN;
        rangeEnd = rangeStart + keyCount - 1;
    }

    if (rangeEnd > MIDI_MAX) {
        rangeEnd = MIDI_MAX;
        rangeStart = rangeEnd - keyCount + 1;
    }

    return { start: rangeStart, end: rangeEnd };
}

function clampRangeToMidiLoose(start, end) {
    let rangeStart = Math.min(start, end);
    let rangeEnd = Math.max(start, end);

    if (rangeStart < MIDI_MIN) rangeStart = MIDI_MIN;
    if (rangeEnd > MIDI_MAX) rangeEnd = MIDI_MAX;

    return { start: rangeStart, end: rangeEnd };
}

function getZoomToFitKeyCount(keyCount) {
    const kbContainer = document.getElementById('keyboardContainer');
    const containerHeight = kbContainer ? (kbContainer.clientHeight || kbContainer.offsetHeight || 0) : 0;
    if (!containerHeight || !Number.isFinite(containerHeight)) return 1;
    return containerHeight / (keyCount * BASE_AVG_KEY_HEIGHT);
}

function applyKeyboardDimensionsToDom(keyboard, dims) {
    if (!keyboard || !dims) return;
    keyboard.style.height = `${Math.round(dims.totalHeight)}px`;
}

function applyKeyDimensions(keyEl, dims, isBlack) {
    if (!keyEl || !dims) return;
    if (isBlack) {
        keyEl.style.width = `${dims.blackWidth}px`;
        keyEl.style.height = `${dims.blackHeight}px`;
    } else {
        keyEl.style.width = `${dims.whiteWidth}px`;
        keyEl.style.height = `${dims.whiteHeight}px`;
    }
}

function getAverageKeyHeight(dims) {
    if (!dims) return BASE_AVG_KEY_HEIGHT;
    return dims.keyHeight;
}

function updateRangeState(startMidi, endMidi) {
    currentStartMidi = startMidi;
    currentEndMidi = endMidi;
    setVisibleMidiRange(startMidi, endMidi);
}

export function setKeyboardKeyCount(targetCount) {
    const nextCount = Math.max(MIN_VISIBLE_KEYS, Math.min(MAX_VISIBLE_KEYS, Math.round(targetCount)));
    const center = Math.round((currentStartMidi + currentEndMidi) / 2);
    let start = center - Math.floor((nextCount - 1) / 2);
    let end = start + nextCount - 1;
    const clamped = clampRangeToMidi(start, end);
    updateRangeState(clamped.start, clamped.end);
    drawVerticalKeyboardNoReset(clamped.start, clamped.end);
}

export function adjustKeyboardKeyCount(delta) {
    const step = Math.trunc(delta);
    if (!step) return;

    const currentCount = currentEndMidi - currentStartMidi + 1;

    if (step < 0) {
        const maxShrink = Math.floor((currentCount - MIN_VISIBLE_KEYS) / 2);
        const shrink = Math.min(-step, maxShrink);
        if (shrink <= 0) return;
        const newStart = currentStartMidi + shrink;
        const newEnd = currentEndMidi - shrink;
        updateRangeState(newStart, newEnd);
        drawVerticalKeyboardNoReset(newStart, newEnd);
        return;
    }

    const newStart = currentStartMidi - step;
    const newEnd = currentEndMidi + step;
    const clamped = clampRangeToMidiLoose(newStart, newEnd);
    if (clamped.start === currentStartMidi && clamped.end === currentEndMidi) return;
    updateRangeState(clamped.start, clamped.end);
    drawVerticalKeyboardNoReset(clamped.start, clamped.end);
}

export function getKeyIndexFromY(y) {
    const keys = document.querySelectorAll('.key');
    if (keys.length === 0) return -1;
    let closestIdx = -1;
    let minDist = Infinity;
    keys.forEach((k, i) => {
        const r = k.getBoundingClientRect();
        const keyY = r.top + r.height / 2;
        const dist = Math.abs(keyY - y);
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    });
    return closestIdx;
}

export function getKeyIndexFromValue(value, maxValue, minValue) {
    const keys = document.querySelectorAll('.key');
    const numKeys = keys.length;
    if (numKeys === 0) return -1;
    const normalized = (value - minValue) / (maxValue - minValue);
    const flipped = 1 - normalized;
    let idx = Math.floor(flipped * numKeys);
    if (idx < 0) idx = 0;
    if (idx >= numKeys) idx = numKeys - 1;
    return idx;
}

// Draw keyboard with section from startMidi to endMidi (inclusive)
// Default: show 3 octaves starting from C4 (60-95)
export function drawVerticalKeyboard(startMidi = 60, endMidi = 95) {
    const clamped = clampRangeToMidi(startMidi, endMidi);
    updateRangeState(clamped.start, clamped.end);

    const keyboard = document.createElement('div');
    const container = document.getElementById('keyboardContainer') || document.querySelector('.keyboard-box');
    if (!container) return;
    
    container.innerHTML = '';
    container.appendChild(keyboard);
    keyboard.classList.add('verticalKeyboardContainer');
    keyboard.id = 'verticalKeyboard';

    const keyCount = clamped.end - clamped.start + 1;
    const zoom = getZoomToFitKeyCount(keyCount);
    const dims = calculateKeyboardDimensions(clamped.start, clamped.end, zoom);
    currentKeyHeight = getAverageKeyHeight(dims);
    applyKeyboardDimensionsToDom(keyboard, dims);
    
    // Draw keys from highest to lowest MIDI (top to bottom)
    for (let midi = clamped.end; midi >= clamped.start; midi--) {
        const keyInfo = keyboardModel.find(k => k.midi === midi);
        if (!keyInfo) continue;
        
        let key;
        if (keyInfo.isBlack) {
            key = createBlackKey(dims);
        } else {
            key = createWhiteKey(dims);
        }
        
        key.dataset.midi = String(midi);
        keyboard.appendChild(key);
    }
    
    applyScaleToKeyboard();
}

export function createWhiteKey(dims) {
    const key = document.createElement('div');
    key.classList.add('key');
    key.classList.add('white');
    applyKeyDimensions(key, dims, false);
    key.style.cursor = 'pointer';
    key.onclick = () => { 
        const keys = key.parentNode.children;
        const idx = Array.from(keys).indexOf(key);
        highlightKey(idx);
    };
    key.addEventListener('mouseenter', () => { key.classList.add('hoveredKey'); });
    key.addEventListener('mouseleave', () => { key.classList.remove('hoveredKey'); });
    key.addEventListener('pointerdown', () => { key.classList.add('pressedKey'); });
    key.addEventListener('pointerup', () => { key.classList.remove('pressedKey'); });
    key.addEventListener('pointercancel', () => { key.classList.remove('pressedKey'); });
    key.addEventListener('pointerleave', () => { key.classList.remove('pressedKey'); });
    return key;
}

export function createBlackKey(dims) {
    const key = document.createElement('div');
    key.classList.add('key');
    key.classList.add('black');
    applyKeyDimensions(key, dims, true);
    key.style.cursor = 'pointer';
    key.onclick = () => { 
        const keys = key.parentNode.children;
        const idx = Array.from(keys).indexOf(key);
        highlightKey(idx);
    };
    key.addEventListener('mouseenter', () => { key.classList.add('hoveredKey'); });
    key.addEventListener('mouseleave', () => { key.classList.remove('hoveredKey'); });
    key.addEventListener('pointerdown', () => { key.classList.add('pressedKey'); });
    key.addEventListener('pointerup', () => { key.classList.remove('pressedKey'); });
    key.addEventListener('pointercancel', () => { key.classList.remove('pressedKey'); });
    key.addEventListener('pointerleave', () => { key.classList.remove('pressedKey'); });
    return key;
}

export function highlightKey(i) {
    const keyboard = document.getElementById('verticalKeyboard');
    if (!keyboard) return;
    const keys = keyboard.children;
    if (i < 0 || i >= keys.length) return;

    const keyEl = keys[i];
    const midi = keyEl.dataset && keyEl.dataset.midi ? parseInt(keyEl.dataset.midi, 10) : NaN;

    const scaleSelect = document.getElementById('scaleSelect');
    const scaleName = scaleSelect ? scaleSelect.value : '';
    const rootNoteSelect = document.getElementById('rootNoteSelect');
    const rootValue = rootNoteSelect ? (parseInt(rootNoteSelect.value, 10) || 0) : 0;

    let isInScale = true;
    if (scaleName && scaleName !== 'none' && scaleName !== 'custom' && SCALES[scaleName] && Number.isFinite(midi)) {
        const pcNote = (midi + 12) % 12;
        const pcRoot = (rootValue || 0) % 12;
        const pcDiff = (pcNote - pcRoot + 12) % 12;
        isInScale = SCALES[scaleName].includes(pcDiff);
    }

    keyEl.classList.toggle('selectedKey');
    
    // Update keyboard model state
    const keyInfo = getKeyInfoByMidi(midi);
    if (keyInfo) {
        keyInfo.isSelected = keyEl.classList.contains('selectedKey');
    }

    // Switch to custom scale when clicking any key that's not in the current scale
    // OR when in 'none' mode (to enable custom selection)
    if ((!isInScale || scaleName === 'none') && scaleSelect) {
        // Before switching to custom, sync the entire DOM state to the model
        // to preserve all currently visible selected keys
        for (let k = 0; k < keys.length; k++) {
            const k_midi = parseInt(keys[k].dataset.midi, 10);
            if (!isNaN(k_midi)) {
                const k_info = getKeyInfoByMidi(k_midi);
                if (k_info) {
                    k_info.isSelected = keys[k].classList.contains('selectedKey');
                }
            }
        }
        
        scaleSelect.value = 'custom';
        applyScaleToKeyboard();
    }
}

export function applyScaleToKeyboard() {
    const keyboard = document.getElementById('verticalKeyboard');
    if (!keyboard) return;
    
    const keys = keyboard.children;
    const numKeys = keys.length;
    
    const scaleSelect = document.getElementById('scaleSelect');
    const scaleName = scaleSelect ? scaleSelect.value : '';
    
    const rootNoteSelect = document.getElementById('rootNoteSelect');
    const rootValue = rootNoteSelect ? (parseInt(rootNoteSelect.value, 10) || 0) : 0;

    // Remove all scale markers first
    for (let i = 0; i < numKeys; i++) {
        keys[i].classList.remove('scaleKey');
        keys[i].style.pointerEvents = 'auto';
    }

    if (scaleName === 'custom') {
        // For custom scales, restore state from model for visible keys
        for (let i = 0; i < numKeys; i++) {
            const midi = parseInt(keys[i].dataset.midi, 10);
            if (isNaN(midi)) continue;
            
            const keyInfo = getKeyInfoByMidi(midi);
            if (keyInfo && keyInfo.isSelected) {
                keys[i].classList.add('selectedKey');
            } else {
                keys[i].classList.remove('selectedKey');
            }
        }
        return;
    }

    // For non-custom scales (including 'none'), clear all selections from DOM
    for (let i = 0; i < numKeys; i++) {
        keys[i].classList.remove('selectedKey');
    }
    
    // Clear model state for ALL 88 keys when using non-custom scales
    keyboardModel.forEach(k => {
        k.isSelected = false;
        k.isScaleKey = false;
    });

    if (!scaleName || !SCALES[scaleName]) {
        return;
    }

    if (scaleName === 'none') {
        // No scale selected - keep everything deselected
        return;
    }

    // Apply predefined scale to ALL 88 keys in the model
    const intervals = SCALES[scaleName];
    keyboardModel.forEach(keyInfo => {
        const midi = keyInfo.midi;
        const pcNote = (midi + 12) % 12;
        const pcRoot = rootValue % 12;
        const pcDiff = (pcNote - pcRoot + 12) % 12;
        
        if (intervals.includes(pcDiff)) {
            keyInfo.isSelected = true;
            keyInfo.isScaleKey = true;
        } else {
            keyInfo.isSelected = false;
            keyInfo.isScaleKey = false;
        }
    });
    
    // Now apply the model state to the visible keys in DOM
    for (let i = 0; i < numKeys; i++) {
        const midi = parseInt(keys[i].dataset.midi, 10);
        if (isNaN(midi)) continue;
        
        const keyInfo = getKeyInfoByMidi(midi);
        if (keyInfo && keyInfo.isSelected) {
            keys[i].classList.add('selectedKey');
            keys[i].classList.add('scaleKey');
        } else {
            keys[i].classList.remove('selectedKey');
        }
    }
}

export function initKeyboard() {
    drawVerticalKeyboard();
    
    const rootNoteSelect = document.getElementById('rootNoteSelect');
    const scaleSelect = document.getElementById('scaleSelect');
    
    if (rootNoteSelect) {
        rootNoteSelect.addEventListener('change', applyScaleToKeyboard);
    }
    
    if (scaleSelect) {
        scaleSelect.addEventListener('change', applyScaleToKeyboard);
    }
    
    // Add drag handler for keyboard shifting
    let isDragging = false;
    let dragStartY = 0;
    let dragStartMidi = currentStartMidi;
    
    const keyboardContainer = document.getElementById('keyboardContainer');
    if (keyboardContainer) {
        keyboardContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragStartY = e.clientY;
            dragStartMidi = currentStartMidi;
            keyboardContainer.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaY = e.clientY - dragStartY;
            const keyHeight = currentKeyHeight || KEYBOARD_BASE_SIZES.keyHeight;
            const keyDelta = Math.round(deltaY / keyHeight);
            
            // Calculate new MIDI range (inverted: drag down = higher notes, up = lower notes)
            const rangeSize = currentEndMidi - currentStartMidi + 1;
            let newStartMidi = dragStartMidi + keyDelta;
            let newEndMidi = newStartMidi + rangeSize - 1;
            const clamped = clampRangeToMidi(newStartMidi, newEndMidi);
            
            if (clamped.start !== currentStartMidi || clamped.end !== currentEndMidi) {
                updateRangeState(clamped.start, clamped.end);
                console.log('Dragging: delta=', deltaY, 'New range:', clamped.start, '-', clamped.end);
                drawVerticalKeyboardNoReset(clamped.start, clamped.end);
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            keyboardContainer.style.cursor = 'grab';
        });
        
        keyboardContainer.addEventListener('mouseleave', () => {
            isDragging = false;
            keyboardContainer.style.cursor = 'grab';
        });
    }
    
    console.log('✅ Keyboard initialized');
}

// Version that doesn't clear container (used internally to avoid losing scroll state during redraw)
function drawVerticalKeyboardNoReset(startMidi = 60, endMidi = 95) {
    const keyboard = document.getElementById('verticalKeyboard');
    if (!keyboard) return;
    
    const clamped = clampRangeToMidi(startMidi, endMidi);
    updateRangeState(clamped.start, clamped.end);
    const keyCount = clamped.end - clamped.start + 1;
    const zoom = getZoomToFitKeyCount(keyCount);
    const dims = calculateKeyboardDimensions(clamped.start, clamped.end, zoom);
    currentKeyHeight = getAverageKeyHeight(dims);
    applyKeyboardDimensionsToDom(keyboard, dims);
    
    // Clear existing keys
    keyboard.innerHTML = '';
    
    // Draw keys from highest to lowest MIDI (top to bottom)
    for (let midi = clamped.end; midi >= clamped.start; midi--) {
        const keyInfo = keyboardModel.find(k => k.midi === midi);
        if (!keyInfo) continue;
        
        let key;
        if (keyInfo.isBlack) {
            key = createBlackKey(dims);
        } else {
            key = createWhiteKey(dims);
        }
        
        key.dataset.midi = String(midi);
        keyboard.appendChild(key);
    }
    
    applyScaleToKeyboard();
}

export async function playMidiIfSelected(midi, time) {
    if (!midi || typeof midi !== 'number') return;
    
    const audioModule = await import('./audio.js');
    const midiModule = await import('./midi.js');
    
    const now = Date.now();
    if ((now - audioModule.lastPlayTime) < 50) return;

    const keyboard = document.getElementById('verticalKeyboard');
    if (!keyboard) return;
    
    let keyEl = null;
    for (let i = 0; i < keyboard.children.length; i++) {
        const k = keyboard.children[i];
        if (k && k.dataset && Number(k.dataset.midi) === midi) { keyEl = k; break; }
    }
    if (!keyEl) return;

    if (!keyEl.classList.contains('selectedKey')) return;

    try {
        if (midiModule.midiEnabled && midiModule.midiOutput) {
            midiModule.playMidiNote(midi);
            audioModule.setLastPlayedMidi(midi);
            audioModule.setLastPlayTime(now);
            
            keyEl.classList.add('playingKey'); 
            setTimeout(() => { try { keyEl.classList.remove('playingKey'); } catch(e){} }, 150);
            return;
        }

        if (!audioModule.samplePlayer || !audioModule.samplePlayer.buffer) return;
        
        audioModule.playSampleAtMidi(midi, time);
        
        audioModule.setLastPlayedMidi(midi);
        audioModule.setLastPlayTime(now);
        
        keyEl.classList.add('playingKey'); 
        setTimeout(() => { try { keyEl.classList.remove('playingKey'); } catch(e){} }, 150);
        
    } catch (e) {
        console.warn('Error playing note', e);
    }
}

export async function triggerPlayWithFallback(requestedMidi, time) {
    if (!requestedMidi || typeof requestedMidi !== 'number') return;
    const keyboard = document.getElementById('verticalKeyboard');
    if (!keyboard) return;

    let directEl = null;
    for (let i = 0; i < keyboard.children.length; i++) {
        const k = keyboard.children[i];
        if (k && k.dataset && Number(k.dataset.midi) === requestedMidi) { directEl = k; break; }
    }

    if (directEl && directEl.classList.contains('selectedKey')) {
        // Play the exact MIDI synchronously
        playSampleNow(requestedMidi);
        return;
    }

    let nearest = null;
    let nearestDiff = Infinity;
    for (let i = 0; i < keyboard.children.length; i++) {
        const k = keyboard.children[i];
        if (!k || !k.dataset) continue;
        if (!k.classList.contains('selectedKey')) continue;
        const m = Number(k.dataset.midi);
        if (!Number.isFinite(m)) continue;
        const diff = Math.abs(m - requestedMidi);
        if (diff < nearestDiff) { nearestDiff = diff; nearest = k; }
    }

    if (nearest) {
        const midi = Number(nearest.dataset.midi);
        console.log('Playing nearest MIDI:', midi, 'instead of:', requestedMidi);
        playSampleNow(midi);
    } else {
        console.warn('No selected keys available for MIDI:', requestedMidi);
    }
}

// Synchronous version for Transport scheduling
function playSampleNow(midi) {
    try {
        // Access audio module from globals
        if (!window.audioModule) {
            console.warn('Audio module not available on window');
            return;
        }
        
        const audioModule = window.audioModule;
        const now = Date.now();
        
        if ((now - audioModule.lastPlayTime) < 50) {
            console.log('Cooldown active, skipping play');
            return;
        }

        const keyboard = document.getElementById('verticalKeyboard');
        if (!keyboard) return;
        
        // Find the exact MIDI key
        let keyEl = null;
        for (let i = 0; i < keyboard.children.length; i++) {
            const k = keyboard.children[i];
            if (k && k.dataset && Number(k.dataset.midi) === midi) { 
                keyEl = k; 
                break; 
            }
        }
        
        if (!keyEl) {
            console.warn('Key not found for MIDI:', midi);
            return;
        }

        if (!keyEl.classList.contains('selectedKey')) {
            console.log('Key not selected for MIDI:', midi);
            return;
        }

        // Try MIDI output first
        if (audioModule.midiEnabled) {
            if (window.midiModule && window.midiModule.midiOutput) {
                console.log('Playing via MIDI output');
                window.midiModule.playMidiNote(midi);
                audioModule.setLastPlayedMidi(midi);
                audioModule.setLastPlayTime(now);
                
                keyEl.classList.add('playingKey'); 
                setTimeout(() => { try { keyEl.classList.remove('playingKey'); } catch(e){} }, 150);
            } else {
                console.log('MIDI mode active but no device selected');
            }
            return;
        }

        // Fall back to sample (only in Presets mode)
        if (!audioModule.samplePlayer || !audioModule.samplePlayer.buffer) {
            console.log('No sample loaded in Presets mode');
            return;
        }
        
        console.log('Playing sample at MIDI:', midi);
        audioModule.playSampleAtMidi(midi, null);
        
        audioModule.setLastPlayedMidi(midi);
        audioModule.setLastPlayTime(now);
        
        keyEl.classList.add('playingKey'); 
        setTimeout(() => { try { keyEl.classList.remove('playingKey'); } catch(e){} }, 150);
        
    } catch (e) {
        console.warn('Error in playSampleNow:', e);
    }
}
