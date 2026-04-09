export let spectrumCanvas = null;
export let spectrumCtx = null;
export let spectrumAnimationId = null;
export let spectrumBands = [];
export let fftAnalyserRef = null;

// Filter handle colors (can be changed by binding)
export let hpHandleColor = 'rgba(255, 255, 255, 0.9)'; // Default white
export let lpHandleColor = 'rgba(255, 255, 255, 0.9)'; // Default white

export function initSpectrum(fftAnalyser) {
    spectrumCanvas = document.getElementById('spectrumCanvas');
    if (!spectrumCanvas) return;
    spectrumCtx = spectrumCanvas.getContext('2d');
    fftAnalyserRef = fftAnalyser;
    
    const numBands = 32;
    spectrumBands = new Array(numBands).fill(0);
    
    startSpectrumLoop();
}

export function startSpectrumLoop() {
    if (spectrumAnimationId) return;
    
    const frequencyBands = [
        20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400,
        500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000,
        5000, 6300, 8000, 10000, 12500, 16000, 20000
    ];
    
    const loop = () => {
        if (!spectrumCtx || !spectrumCanvas || !fftAnalyserRef) {
            spectrumAnimationId = null;
            return;
        }
        
        const dpr = window.devicePixelRatio || 1;
        const rect = spectrumCanvas.getBoundingClientRect();
        const logicalWidth = rect.width;
        const logicalHeight = rect.height;
        const targetWidth = Math.round(logicalWidth * dpr);
        const targetHeight = Math.round(logicalHeight * dpr);

        if (spectrumCanvas.width !== targetWidth || spectrumCanvas.height !== targetHeight) {
            spectrumCanvas.width = targetWidth;
            spectrumCanvas.height = targetHeight;
            spectrumCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        
        const values = fftAnalyserRef.getValue();
        const width = logicalWidth;
        const height = logicalHeight;
        const sampleRate = 44100;
        const nyquist = sampleRate / 2;
        
        spectrumCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        spectrumCtx.fillRect(0, 0, width, height);
        
        const numBands = spectrumBands.length;
        const totalGap = numBands - 1;
        const gapWidth = 2;
        const barWidth = (width - totalGap * gapWidth) / numBands;
        
        for (let i = 0; i < numBands; i++) {
            const freqStart = i === 0 ? 20 : frequencyBands[i - 1];
            const freqEnd = i < frequencyBands.length ? frequencyBands[i] : nyquist;
            
            const binStart = Math.floor((freqStart / nyquist) * values.length);
            const binEnd = Math.ceil((freqEnd / nyquist) * values.length);
            
            let sum = 0;
            let count = 0;
            for (let j = binStart; j < binEnd && j < values.length; j++) {
                sum += values[j];
                count++;
            }
            const avgDb = count > 0 ? sum / count : -100;
            
            const normalizedValue = Math.max(0, Math.min(1, (avgDb + 100) / 100));
            
            const smoothFactor = 0.3;
            spectrumBands[i] = spectrumBands[i] * (1 - smoothFactor) + normalizedValue * smoothFactor;
            
            if (normalizedValue < spectrumBands[i]) {
                spectrumBands[i] *= 0.85;
            }
        }
        
        const gradient = spectrumCtx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#34d399');
        gradient.addColorStop(0.5, '#fbbf24');
        gradient.addColorStop(1, '#ef4444');
        
        spectrumCtx.fillStyle = gradient;
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(0, height);
        
        for (let i = 0; i < numBands; i++) {
            const barHeight = spectrumBands[i] * height;
            const x = i * (barWidth + gapWidth) + barWidth / 2;
            const y = height - barHeight;
            
            if (i === 0) {
                spectrumCtx.lineTo(x, y);
            } else {
                const prevX = (i - 1) * (barWidth + gapWidth) + barWidth / 2;
                const prevY = height - spectrumBands[i - 1] * height;
                const cpX1 = prevX + (x - prevX) / 2;
                const cpX2 = prevX + (x - prevX) / 2;
                spectrumCtx.bezierCurveTo(cpX1, prevY, cpX2, y, x, y);
            }
        }
        
        spectrumCtx.lineTo(width, height);
        spectrumCtx.closePath();
        spectrumCtx.fill();
        
        spectrumCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        spectrumCtx.lineWidth = 2;
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(0, height);
        for (let i = 0; i < numBands; i++) {
            const barHeight = spectrumBands[i] * height;
            const x = i * (barWidth + gapWidth) + barWidth / 2;
            const y = height - barHeight;
            if (i === 0) {
                spectrumCtx.lineTo(x, y);
            } else {
                const prevX = (i - 1) * (barWidth + gapWidth) + barWidth / 2;
                const prevY = height - spectrumBands[i - 1] * height;
                const cpX1 = prevX + (x - prevX) / 2;
                const cpX2 = prevX + (x - prevX) / 2;
                spectrumCtx.bezierCurveTo(cpX1, prevY, cpX2, y, x, y);
            }
        }
        spectrumCtx.stroke();
        
        const frequencyMarkings = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        const hzToPixelInGrid = (hz) => {
            const log20 = Math.log(20);
            const log20k = Math.log(20000);
            const logHz = Math.log(hz);
            return ((logHz - log20) / (log20k - log20)) * width;
        };
        
        spectrumCtx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
        spectrumCtx.lineWidth = 1;
        spectrumCtx.setLineDash([4, 3]);
        frequencyMarkings.forEach(freq => {
            const x = hzToPixelInGrid(freq);
            spectrumCtx.beginPath();
            spectrumCtx.moveTo(x, 0);
            spectrumCtx.lineTo(x, height);
            spectrumCtx.stroke();
        });
        spectrumCtx.setLineDash([]);
        
        const hzToPixelInLoop = (hz) => {
            const log20 = Math.log(20);
            const log20k = Math.log(20000);
            const logHz = Math.log(hz);
            return ((logHz - log20) / (log20k - log20)) * width;
        };
        
        // Draw filter response curves
        if (window.audioModule) {
            const eqHighpassFreq = window.audioModule.eqHighpassFreq;
            const eqLowpassFreq = window.audioModule.eqLowpassFreq;
            const eqEnabled = window.audioModule.eqEnabled;
            const eqHighpassRolloff = window.audioModule.eqHighpassRolloff;
            const eqLowpassRolloff = window.audioModule.eqLowpassRolloff;
            
            const hpX = hzToPixelInLoop(eqHighpassFreq);
            const lpX = hzToPixelInLoop(eqLowpassFreq);
            
            const lineOpacity = eqEnabled ? 1 : 0.25;
            const curveOpacity = eqEnabled ? 0.7 : 0.2;
            const areaOpacity = eqEnabled ? 0.05 : 0.02;
            const handleOpacity = eqEnabled ? 1 : 0.3;
            
            if (eqEnabled) {
                const pixelToHz = (px) => {
                    const t = px / width;
                    const log20 = Math.log(20);
                    const log20k = Math.log(20000);
                    return Math.exp(log20 + t * (log20k - log20));
                };
                
                spectrumCtx.strokeStyle = `rgba(251, 191, 36, ${curveOpacity})`;
                spectrumCtx.lineWidth = 3;
                spectrumCtx.beginPath();
                
                const hpSlopeFactor = Math.abs(eqHighpassRolloff) / 12;
                let isFirstPoint = true;
                
                for (let x = 0; x <= width; x += 2) {
                    const freq = pixelToHz(x);
                    
                    let response = 1;
                    if (freq < eqHighpassFreq) {
                        const ratio = freq / eqHighpassFreq;
                        response *= Math.pow(ratio, hpSlopeFactor);
                    }
                    if (freq > eqLowpassFreq) {
                        const ratio = eqLowpassFreq / freq;
                        const lpSlopeFactor = Math.abs(eqLowpassRolloff) / 12;
                        response *= Math.pow(ratio, lpSlopeFactor);
                    }
                    
                    const responseDb = 20 * Math.log10(Math.max(0.001, response));
                    const y = height - ((responseDb + 50) / 50) * height * 0.80;
                    
                    if (isFirstPoint) {
                        spectrumCtx.moveTo(x, y);
                        isFirstPoint = false;
                    } else {
                        spectrumCtx.lineTo(x, y);
                    }
                }
                spectrumCtx.stroke();
            }
            
            // Draw vertical dashed lines for cutoff frequencies
            spectrumCtx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
            spectrumCtx.lineWidth = 2;
            spectrumCtx.setLineDash([6, 4]);
            
            // Highpass cutoff line
            spectrumCtx.beginPath();
            spectrumCtx.moveTo(hpX, 0);
            spectrumCtx.lineTo(hpX, height);
            spectrumCtx.stroke();
            
            // Lowpass cutoff line
            spectrumCtx.beginPath();
            spectrumCtx.moveTo(lpX, 0);
            spectrumCtx.lineTo(lpX, height);
            spectrumCtx.stroke();
            
            spectrumCtx.setLineDash([]);
            
            // Draw filter handles with dynamic colors
            spectrumCtx.fillStyle = hpHandleColor;
            spectrumCtx.beginPath();
            spectrumCtx.arc(hpX, 10, 6, 0, Math.PI * 2);
            spectrumCtx.fill();
            spectrumCtx.strokeStyle = hpHandleColor.replace(/[\d.]+\)$/, '1)'); // Full opacity for stroke
            spectrumCtx.lineWidth = 2;
            spectrumCtx.stroke();
            
            spectrumCtx.fillStyle = lpHandleColor;
            spectrumCtx.beginPath();
            spectrumCtx.arc(lpX, 10, 6, 0, Math.PI * 2);
            spectrumCtx.fill();
            spectrumCtx.strokeStyle = lpHandleColor.replace(/[\d.]+\)$/, '1)'); // Full opacity for stroke
            spectrumCtx.lineWidth = 2;
            spectrumCtx.stroke();
        }
        
        // Draw frequency labels at the bottom
        const frequencyLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        const hzToPixelForLabel = (hz) => {
            const log20 = Math.log(20);
            const log20k = Math.log(20000);
            const logHz = Math.log(hz);
            return ((logHz - log20) / (log20k - log20)) * width;
        };
        
        spectrumCtx.font = '8px "Space Mono", monospace';
        spectrumCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        spectrumCtx.textAlign = 'center';
        
        frequencyLabels.forEach(freq => {
            const x = hzToPixelForLabel(freq);
            let label;
            if (freq >= 1000) {
                label = (freq / 1000).toFixed(freq >= 10000 ? 0 : 1) + 'k';
            } else {
                label = Math.round(freq).toString();
            }
            spectrumCtx.fillText(label, x, height - 2);
        });
        
        spectrumAnimationId = requestAnimationFrame(loop);
    };
    
    spectrumAnimationId = requestAnimationFrame(loop);
}

export function setupSpectrumCanvasInteraction() {
    const canvas = document.getElementById('spectrumCanvas');
    if (!canvas) return;
    
    const DRAG_THRESHOLD = 10;
    const EQ_MIN_FREQ = 20;
    const EQ_MAX_FREQ = 20000;
    
    let eqDraggingFilter = null;
    
    const hzToPixel = (hz) => {
        const canvasWidth = canvas.offsetWidth;
        const log20 = Math.log(20);
        const log20k = Math.log(20000);
        const logHz = Math.log(hz);
        return ((logHz - log20) / (log20k - log20)) * canvasWidth;
    };
    
    const pixelToHz = (px) => {
        const canvasWidth = canvas.offsetWidth;
        const log20 = Math.log(20);
        const log20k = Math.log(20000);
        const t = px / canvasWidth;
        return Math.exp(log20 + t * (log20k - log20));
    };
    
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        const audioModule = window.audioModule;
        if (!audioModule) return;
        
        const hpPixel = hzToPixel(audioModule.eqHighpassFreq);
        const lpPixel = hzToPixel(audioModule.eqLowpassFreq);
        
        if (Math.abs(mouseX - hpPixel) < DRAG_THRESHOLD) {
            eqDraggingFilter = 'hp';
            e.preventDefault();
        } else if (Math.abs(mouseX - lpPixel) < DRAG_THRESHOLD) {
            eqDraggingFilter = 'lp';
            e.preventDefault();
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        const audioModule = window.audioModule;
        if (!audioModule) return;
        
        if (eqDraggingFilter) {
            const newFreq = Math.max(EQ_MIN_FREQ, Math.min(EQ_MAX_FREQ, pixelToHz(mouseX)));
            
            if (eqDraggingFilter === 'hp') {
                if (window.setEQHighpassFreq) {
                    window.setEQHighpassFreq(newFreq);
                }
            } else if (eqDraggingFilter === 'lp') {
                if (window.setEQLowpassFreq) {
                    window.setEQLowpassFreq(newFreq);
                }
            }
        } else {
            const hpPixel = hzToPixel(audioModule.eqHighpassFreq);
            const lpPixel = hzToPixel(audioModule.eqLowpassFreq);
            const CURSOR_THRESHOLD = 15;
            
            if (Math.abs(mouseX - hpPixel) < CURSOR_THRESHOLD || Math.abs(mouseX - lpPixel) < CURSOR_THRESHOLD) {
                canvas.style.cursor = 'ew-resize';
            } else {
                canvas.style.cursor = 'default';
            }
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        eqDraggingFilter = null;
        canvas.style.cursor = 'default';
    });
    
    canvas.addEventListener('mouseleave', () => {
        eqDraggingFilter = null;
        canvas.style.cursor = 'default';
    });
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        const audioModule = window.audioModule;
        if (!audioModule) return;
        
        const EQ_VALID_ROLLOFFS = [-12, -24, -48, -96];
        const hpPixel = hzToPixel(audioModule.eqHighpassFreq);
        const lpPixel = hzToPixel(audioModule.eqLowpassFreq);
        const THRESHOLD = 50;
        
        let targetFilter = null;
        if (Math.abs(mouseX - hpPixel) < THRESHOLD) {
            targetFilter = 'hp';
        } else if (Math.abs(mouseX - lpPixel) < THRESHOLD) {
            targetFilter = 'lp';
        }
        
        if (targetFilter) {
            if (targetFilter === 'hp') {
                const currentIndex = EQ_VALID_ROLLOFFS.indexOf(audioModule.eqHighpassRolloff);
                let newIndex = currentIndex;
                
                if (e.deltaY < 0 && currentIndex < EQ_VALID_ROLLOFFS.length - 1) {
                    newIndex = currentIndex + 1;
                } else if (e.deltaY > 0 && currentIndex > 0) {
                    newIndex = currentIndex - 1;
                }
                
                if (newIndex !== currentIndex) {
                    if (window.setEQHighpassRolloff) {
                        window.setEQHighpassRolloff(EQ_VALID_ROLLOFFS[newIndex]);
                    }
                }
            } else if (targetFilter === 'lp') {
                const currentIndex = EQ_VALID_ROLLOFFS.indexOf(audioModule.eqLowpassRolloff);
                let newIndex = currentIndex;
                
                if (e.deltaY < 0 && currentIndex < EQ_VALID_ROLLOFFS.length - 1) {
                    newIndex = currentIndex + 1;
                } else if (e.deltaY > 0 && currentIndex > 0) {
                    newIndex = currentIndex - 1;
                }
                
                if (newIndex !== currentIndex) {
                    if (window.setEQLowpassRolloff) {
                        window.setEQLowpassRolloff(EQ_VALID_ROLLOFFS[newIndex]);
                    }
                }
            }
        }
    });
}
// Functions to update filter handle colors from binding
export function setHPHandleColor(color) {
    hpHandleColor = color;
}

export function setLPHandleColor(color) {
    lpHandleColor = color;
}

export function resetHPHandleColor() {
    hpHandleColor = 'rgba(255, 255, 255, 0.9)';
}

export function resetLPHandleColor() {
    lpHandleColor = 'rgba(255, 255, 255, 0.9)';
}
