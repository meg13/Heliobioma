export let recorder = null;
export let isRecording = false;
export let recordingStartTime = null;
export let recordingDuration = 0;
export let recordingTimerInterval = null;

export function initRecorder() {
    try {
        if (recorder) {
            try { recorder.dispose(); } catch (e) {}
            recorder = null;
        }
        
        recorder = new Tone.Recorder({ mimeType: 'audio/webM' });
        const audio = window.audioModule;

        if (audio && audio.mainLimiter) {
            audio.mainLimiter.connect(recorder);
            console.log('Recorder connected to mainLimiter');
        } else if (audio && audio.mainCompressor) {
            audio.mainCompressor.connect(recorder);
            console.log('Recorder connected to mainCompressor');
        } else if (audio && audio.masterVolume) {
            audio.masterVolume.connect(recorder);
            console.log('Recorder connected to masterVolume');
        } else {
            console.error('No audio node found to connect recorder');
            return false;
        }
        
        return true;
    } catch (e) {
        console.error('Failed to initialize recorder:', e);
        return false;
    }
}

export async function startRecording() {
    try {
        if (window.audioModule && window.audioModule.ensureToneStarted) {
            await window.audioModule.ensureToneStarted();
        }
        
        if (!initRecorder()) {
            throw new Error('Failed to initialize recorder');
        }
        
        await recorder.start();
        
        isRecording = true;
        recordingStartTime = Date.now();
        recordingDuration = 0;
        
        recordingTimerInterval = setInterval(() => {
            recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
            updateRecordingUI();
        }, 100);
        
        console.log('Recording started');
        return true;
        
    } catch (e) {
        console.error('Failed to start recording:', e);
        isRecording = false;
        return false;
    }
}

// Convert AudioBuffer to 16-bit WAV Blob
function audioBufferToWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    
    // Get channel data
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }
    
    // Calculate sizes
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = length * blockAlign;
    const fileSize = 36 + dataSize;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // Write RIFF header
    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(8, 'WAVE');
    
    // Write fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit
    
    // Write data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write audio data
    let index = 44;
    const volume = 0.8;
    for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i])) * volume;
            const s16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            view.setInt16(index, s16, true);
            index += 2;
        }
    }
    
    console.log(`WAV generated: ${length} samples, ${numChannels} channels, ${fileSize} bytes`);
    return new Blob([buffer], { type: 'audio/wav' });
}

async function blobToWavBlob(webmBlob) {
    try {
        const arrayBuffer = await webmBlob.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const wavBlob = audioBufferToWavBlob(audioBuffer);
        console.log(`✅ Converted WebM (${webmBlob.size} bytes) to WAV (${wavBlob.size} bytes)`);
        return wavBlob;
    } catch (e) {
        console.error('❌ WAV conversion failed:', e);
        throw e;
    }
}

export async function stopRecording() {
    try {
        if (!recorder || !isRecording) {
            console.warn('No active recording to stop');
            return false;
        }
        
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }
        
        const recording = await recorder.stop();
        
        if (!recording || recording.size === 0) {
            throw new Error('Recording is empty or corrupted');
        }
        
        console.log(`Recording stopped (${recordingDuration}s, ${(recording.size / 1024).toFixed(2)} KB)`);
        console.log(`Original blob type: ${recording.type}, size: ${recording.size}`);

        // Convert WebM/OGG to WAV
        let wavBlob;
        try {
            wavBlob = await blobToWavBlob(recording);
            console.log(`✅ Successfully converted to WAV (${wavBlob.size} bytes)`);
        } catch (convErr) {
            console.error('❌ WAV conversion failed:', convErr);
            console.warn('Falling back to original blob');
            wavBlob = recording;
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `sun-synth-${timestamp}.wav`;
        
        console.log(`Downloading as: ${filename} (${wavBlob.size} bytes, type: ${wavBlob.type})`);
        
        const url = URL.createObjectURL(wavBlob);
        const anchor = document.createElement('a');
        anchor.download = filename;
        anchor.href = url;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        
        setTimeout(() => {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            console.log('Download completed, URL cleaned up');
        }, 1000);
        
        isRecording = false;
        
        if (recorder) {
            try { recorder.dispose(); } catch (e) {}
            recorder = null;
        }
        
        return true;
        
    } catch (e) {
        console.error('Failed to stop recording:', e);
        isRecording = false;
        
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }
        
        return false;
    }
}

export function updateRecordingUI() {
    const recordBtn = document.getElementById('recordBtn');
    if (!recordBtn) return;
    
    if (isRecording) {
        recordBtn.classList.add('recording');
    } else {
        recordBtn.classList.remove('recording');
    }
}

export function initRecorderUI() {
    const recordBtn = document.getElementById('recordBtn');
    if (!recordBtn) return;
    
    recordBtn.addEventListener('click', async () => {
        if (!isRecording) {
            recordBtn.classList.add('recording');
            const success = await startRecording();
            
            if (!success) {
                recordBtn.classList.remove('recording');
                alert('Errore durante l\'avvio della registrazione. Verifica la console.');
            }
            
            updateRecordingUI();
        } else {
            recordBtn.classList.remove('recording');
            const success = await stopRecording();
            
            if (!success) {
                alert('Errore durante il salvataggio della registrazione. Verifica la console.');
            }
            
            updateRecordingUI();
        }
    });
    
    console.log('✅ Recorder UI initialized');
}
