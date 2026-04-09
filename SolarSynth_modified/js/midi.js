export let midiOutput = null;
export let midiEnabled = false;
export let currentMidiNote = null;
export let midiChannel = 0;

export async function initMidiAccess() {
    try {
        const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        
        const selectEl = document.getElementById('midiOutputSelect');
        const statusEl = document.getElementById('midiStatus');

        const updateMidiList = () => {
            if (!selectEl) return;
            
            const currentSelection = selectEl.value;
            
            selectEl.innerHTML = '<option value="">None</option>';
            
            const outputs = Array.from(midiAccess.outputs.values());
            let hasOutputs = outputs.length > 0;
            let deviceFoundAgain = false;

            outputs.forEach(output => {
                const option = document.createElement('option');
                option.value = output.id;
                option.textContent = output.name || `MIDI Output ${output.id}`;
                selectEl.appendChild(option);

                if (output.id === currentSelection) {
                    option.selected = true;
                    deviceFoundAgain = true;
                }
            });

            if (!hasOutputs) {
                if (statusEl) statusEl.textContent = 'MIDI: nessun dispositivo trovato';
                console.warn('⚠️ Nessun dispositivo MIDI output trovato');
            } else if (!deviceFoundAgain && currentSelection !== "") {
                if (statusEl) statusEl.textContent = 'MIDI: Dispositivo scollegato';
                midiOutput = null;
            } else if (hasOutputs) {
                if (statusEl) statusEl.textContent = `MIDI: ${outputs.length} dispositivo(i) rilevato(i)`;
                console.log('✅ Dispositivi MIDI trovati:', outputs.map(o => o.name || o.id));
            }
        };

        updateMidiList();

        midiAccess.onstatechange = (e) => {
            console.log('MIDI state change event:', e);
            updateMidiList();
        };
        
        return midiAccess;

    } catch (e) {
        console.error('Web MIDI API not supported or access denied:', e);
        const statusEl = document.getElementById('midiStatus');
        if(statusEl) statusEl.textContent = 'MIDI: Errore o accesso negato';
        return null;
    }
}

export function sendMidiNoteOn(noteNumber, velocity = 100, channel = 0) {
    if (!midiOutput) return;
    
    const noteOnMessage = [0x90 + channel, noteNumber, velocity];
    try {
        midiOutput.send(noteOnMessage);
        currentMidiNote = noteNumber;
    } catch (e) {
        console.error('Failed to send MIDI Note On:', e);
    }
}

export function sendMidiNoteOff(noteNumber, channel = 0) {
    if (!midiOutput) return;
    
    const noteOffMessage = [0x80 + channel, noteNumber, 0];
    try {
        midiOutput.send(noteOffMessage);
    } catch (e) {
        console.error('Failed to send MIDI Note Off:', e);
    }
}

export function playMidiNote(midiNumber) {
    console.log('🎹 playMidiNote called:', { midiNumber, midiEnabled, hasOutput: !!midiOutput });
    
    if (!midiEnabled || !midiOutput) {
        console.warn('❌ Cannot play: midiEnabled=', midiEnabled, 'midiOutput=', midiOutput);
        return;
    }
    
    if (currentMidiNote !== null && currentMidiNote !== midiNumber) {
        sendMidiNoteOff(currentMidiNote, midiChannel);
    }
    
    console.log('✅ Sending MIDI Note On:', midiNumber);
    sendMidiNoteOn(midiNumber, 100, midiChannel);
}

export function stopMidiNote() {
    if (currentMidiNote !== null) {
        sendMidiNoteOff(currentMidiNote, midiChannel);
        currentMidiNote = null;
    }
}

export function sendAllNotesOff(channel = midiChannel) {
    if (!midiOutput) return;
    try {
        midiOutput.send([0xB0 + channel, 123, 0]);
    } catch (e) {
        console.error('Failed to send All Notes Off:', e);
    }
}

export function panicMidi(channel = 0) {
    stopMidiNote();
    sendAllNotesOff(channel);
}

export function setMidiOutput(output) {
    midiOutput = output;
}

export function setMidiEnabled(enabled) {
    midiEnabled = enabled;
}

export function setMidiChannel(channel) {
    const ch = Number(channel);
    if (!Number.isFinite(ch)) return;
    midiChannel = Math.max(0, Math.min(15, Math.round(ch)));
}

export async function initMidiUI() {
    try {
        const midiAccess = await initMidiAccess();
        if (!midiAccess) return;
        
        const selectEl = document.getElementById('midiOutputSelect');
        const statusEl = document.getElementById('midiStatus');
        const channelEl = document.getElementById('midiChannelSelect');
        
        if (selectEl) {
            selectEl.addEventListener('change', (e) => {
                const selectedId = e.target.value;
                if (selectedId && midiAccess) {
                    midiOutput = midiAccess.outputs.get(selectedId);
                    if (midiOutput) {
                        // MIDI always enabled when device is selected in MIDI mode
                        midiEnabled = true;
                        if (window.audioModule) {
                            window.audioModule.midiEnabled = true;
                        }
                        if (statusEl) statusEl.textContent = `MIDI: attivo → ${midiOutput.name}`;
                        console.log('✅ MIDI device selected and enabled:', midiOutput.name);
                    }
                } else {
                    midiOutput = null;
                    midiEnabled = false;
                    if (window.audioModule) {
                        window.audioModule.midiEnabled = false;
                    }
                    if (statusEl) statusEl.textContent = 'MIDI: nessun dispositivo selezionato';
                    stopMidiNote();
                }
            });
        }

        if (channelEl) {
            channelEl.addEventListener('change', (e) => {
                setMidiChannel(e.target.value);
            });
        }
        
        console.log('✅ MIDI UI initialized');
    } catch (e) {
        console.error('Failed to initialize MIDI UI:', e);
    }
}
