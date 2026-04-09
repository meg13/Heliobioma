export function updateDbReadout(volumeDb) {
    const readout = document.getElementById('dbReadout');
    if (!readout) return;
    const val = volumeDb === 0 ? '0' : volumeDb.toFixed(1);
    readout.textContent = `${val} dB`;
}

export function startDbMeterLoop(outputMeter) {
    let meterAnimationId = null;
    if (meterAnimationId) return;
    
    const loop = () => {
        const fill = document.getElementById('dbMeterFill');
        if (!fill || !outputMeter) {
            meterAnimationId = null;
            return;
        }
        let level = outputMeter.getValue();
        if (!Number.isFinite(level)) level = -60;
        const colorLevel = level;
        const clamped = Math.max(-60, Math.min(0, level));
        const pct = Math.max(0, Math.min(1, (clamped + 60) / 60));
        fill.style.width = `${pct * 100}%`;
        let color = '#22c55e';
        if (colorLevel > -3 && colorLevel <= 0) color = '#fbbf24';
        else if (colorLevel > 0) color = '#ef4444';
        fill.style.background = color;
        meterAnimationId = requestAnimationFrame(loop);
    };
    
    meterAnimationId = requestAnimationFrame(loop);
    return meterAnimationId;
}

export function attachVolumeSlider(setMasterVolume, currentVolumeDb, VOLUME_MIN, VOLUME_MAX, SNAP_THRESHOLD) {
    const thumb = document.getElementById('volumeThumb');
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

export function setupEffectKnob(knobId, callback, defaultValue = 0, valueFormatter = null) {
    const knob = document.getElementById(knobId);
    if (!knob) return;

    // Store formatter globally for chart binding updates
    window.knobFormatters = window.knobFormatters || {};
    if (valueFormatter) {
        window.knobFormatters[knobId] = valueFormatter;
    }

    let currentValue = defaultValue;
    let isDragging = false;
    let startY = 0;
    let startValue = currentValue;

    const sensitivity = 0.005;

    const updateKnobRotation = () => {
        const angle = -135 + (currentValue * 270);
        knob.style.transform = `rotate(${angle}deg)`;
    };

    const updateValueDisplay = () => {
        const parent = knob.closest('.effect-param');
        if (!parent) return;
        
        let valueEl = parent.querySelector('.param-value');
        if (!valueEl) {
            valueEl = document.createElement('div');
            valueEl.className = 'param-value';
            parent.appendChild(valueEl);
        }
        
        if (valueFormatter) {
            valueEl.textContent = valueFormatter(currentValue);
        } else {
            valueEl.textContent = Math.round(currentValue * 100) + '%';
        }
    };

    // Expose setter for external control (e.g., randomize)
    window.setKnobValue = window.setKnobValue || {};
    window.setKnobValue[knobId] = (newValue) => {
        currentValue = Math.max(0, Math.min(1, newValue));
        updateKnobRotation();
        updateValueDisplay();
        if (callback) callback(currentValue);
    };

    const onMouseDown = (e) => {
        isDragging = true;
        startY = e.clientY;
        startValue = currentValue;
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        
        const deltaY = startY - e.clientY;
        let newValue = startValue + (deltaY * sensitivity);
        newValue = Math.max(0, Math.min(1, newValue));
        
        currentValue = newValue;
        updateKnobRotation();
        updateValueDisplay();
        
        if (callback) callback(currentValue);
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = 'default';
    };

    knob.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // --- NUOVA AGGIUNTA: RESET A ZERO CON DOPPIO CLICK ---
    knob.addEventListener('dblclick', (e) => {
        e.preventDefault();
        currentValue = 0; // Forza il valore a 0
        updateKnobRotation();
        updateValueDisplay();
        if (callback) callback(currentValue);
    });
    // -----------------------------------------------------

    // Add wheel scroll support
    knob.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        let newValue = currentValue;
        if (e.deltaY < 0) {
            // Scroll up - increase value
            newValue = Math.min(1, currentValue + 0.05);
        } else {
            // Scroll down - decrease value
            newValue = Math.max(0, currentValue - 0.05);
        }
        
        currentValue = newValue;
        updateKnobRotation();
        updateValueDisplay();
        
        if (callback) callback(currentValue);
    });

    currentValue = defaultValue;
    updateKnobRotation();
    updateValueDisplay();
    if (callback) callback(currentValue);
}

export function initUI() {
    let isPlaying = false;
    
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', async () => {
            playPauseBtn.classList.remove('attention-seeker');

            if (!isPlaying) {
                if (typeof Tone !== 'undefined') {
                    await Tone.start();
                }
                
                if (window.startTransport) {
                    const speedMs = 750;
                    window.startTransport(speedMs);
                }
                playPauseBtn.classList.add('playing');
                playPauseBtn.textContent = 'PAUSE';
                isPlaying = true;
            } else {
                if (window.stopTransport) {
                    window.stopTransport();
                }
                playPauseBtn.classList.remove('playing');
                playPauseBtn.textContent = 'PLAY';
                isPlaying = false;
            }
        });
    }
    
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (isPlaying && window.stopTransport) {
                window.stopTransport();
                if (playPauseBtn) {
                    playPauseBtn.classList.remove('playing');
                    playPauseBtn.textContent = 'PLAY';
                }
                isPlaying = false;
            }
            
            if (window.resetTransport) {
                window.resetTransport();
            }
            
            console.log('Reset: transport e cursore resettati');
        });
    }
    
    const metronomeBtn = document.getElementById('metronomeBtn');
    if (metronomeBtn) {
        let metronomeEnabled = false;
        metronomeBtn.addEventListener('click', async () => {
            metronomeEnabled = !metronomeEnabled;
            
            if (typeof Tone !== 'undefined') {
                if (window.audioModule && window.audioModule.setMetronomeEnabled) {
                    window.audioModule.setMetronomeEnabled(metronomeEnabled);
                    console.log('Metronome set to:', metronomeEnabled);
                }
            }
            
            if (metronomeEnabled) {
                metronomeBtn.classList.add('active');
                metronomeBtn.style.background = 'rgba(52, 211, 153, 0.2)';
                metronomeBtn.style.borderColor = 'rgba(52, 211, 153, 0.6)';
            } else {
                metronomeBtn.classList.remove('active');
                metronomeBtn.style.background = '';
                metronomeBtn.style.borderColor = '';
            }
        });
    }

    // Randomize effects button
    const randomBtn = document.getElementById('randomizeEffectsBtn');
    if (randomBtn) {
        const targetKnobs = [
            'distortionDriveKnob', 'distortionToneKnob', 'distortionMixKnob',
            'chorusDepthKnob', 'chorusRateKnob', 'chorusMixKnob',
            'delayTimeKnob', 'delayFeedbackKnob', 'delayMixKnob',
            'reverbDecayKnob', 'reverbSizeKnob', 'reverbMixKnob'
        ];
        randomBtn.addEventListener('click', () => {
            if (!window.setKnobValue) return;
            targetKnobs.forEach(id => {
                if (window.setKnobValue[id]) {
                    window.setKnobValue[id](Math.random());
                }
            });
        });
    }
    
    const speedKnobControl = document.getElementById('speedKnobControl');
    const speedValue = document.getElementById('speedValue');
    if (speedKnobControl) {
        let isDragging = false;
        let startY = 0;

        const defaultBpm = 120;
        const defaultMs = 500;

        let startSpeed = defaultMs; 
        let currentSpeed = startSpeed;

        const sensitivity = 2;
        const minBpm = 40;
        const maxBpm = 500;

        const bpmToMs = (bpm) => Math.round(60000 / bpm);
        const msToBpm = (ms) => Math.round(60000 / ms);

        const updateKnobRotation = (speedMs) => {
            const bpm = msToBpm(speedMs);
            const normalized = (bpm - minBpm) / (maxBpm - minBpm);
            const angle = -135 + (normalized * 270);
            speedKnobControl.style.transform = `rotate(${angle}deg)`;
        };

        updateKnobRotation(currentSpeed);
        if (speedValue) {
            speedValue.textContent = `${defaultBpm} BPM`;
            speedValue.title = "Doppio click per modificare";
            if (typeof Tone !== 'undefined' && Tone.Transport) {
                Tone.Transport.bpm.value = defaultBpm;
            }
        }

        speedKnobControl.addEventListener('dblclick', (e) => {
            e.preventDefault();
            
            currentSpeed = defaultMs;
            updateKnobRotation(defaultMs);
            if (speedValue) speedValue.textContent = `${defaultBpm} BPM`;
            if (typeof Tone !== 'undefined' && Tone.Transport) {
                Tone.Transport.bpm.value = defaultBpm;
            }
            
            console.log('BPM resettati a default:', defaultBpm);
        });

        if (speedValue) {
            speedValue.addEventListener('dblclick', () => {
                const currentText = speedValue.textContent;
                const currentBpmVal = parseInt(currentText) || defaultBpm;

                const input = document.createElement('input');
                input.type = 'number';
                input.value = currentBpmVal;
                input.className = 'bpm-input';

                speedValue.textContent = '';
                speedValue.appendChild(input);
                input.focus();
                input.select();

                const commitChange = () => {
                    let newVal = parseInt(input.value);
                    if (isNaN(newVal)) newVal = currentBpmVal;
                    newVal = Math.max(minBpm, Math.min(maxBpm, newVal));

                    const newMs = bpmToMs(newVal);
                    currentSpeed = newMs;
                    
                    updateKnobRotation(newMs);
                    speedValue.textContent = `${newVal} BPM`;

                    if (typeof Tone !== 'undefined' && Tone.Transport) {
                        Tone.Transport.bpm.value = newVal;
                    }
                };

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') commitChange();
                    else if (e.key === 'Escape') speedValue.textContent = `${currentBpmVal} BPM`;
                    e.stopPropagation();
                });

                input.addEventListener('blur', () => commitChange());
            });
        }
        
        speedKnobControl.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startSpeed = currentSpeed;
            document.body.style.cursor = 'ns-resize';
            if (speedValue) speedValue.classList.add('visible');
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaY = startY - e.clientY;
            const deltaBpm = Math.round(deltaY * sensitivity);
            let newBpm = msToBpm(startSpeed) + deltaBpm;
            
            newBpm = Math.max(minBpm, Math.min(maxBpm, newBpm));
            
            const newSpeed = bpmToMs(newBpm);
            
            if (newSpeed !== currentSpeed) {
                currentSpeed = newSpeed;
                updateKnobRotation(newSpeed);
                if (speedValue) speedValue.textContent = `${newBpm} BPM`;
                
                if (typeof Tone !== 'undefined' && Tone.Transport) {
                    Tone.Transport.bpm.value = newBpm;
                }
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';
                if (speedValue) {
                    setTimeout(() => speedValue.classList.remove('visible'), 1500);
                }
            }
        });

        // Setup drag-drop for BPM speed knob
        speedKnobControl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            speedKnobControl.classList.add('drag-over');
        });

        speedKnobControl.addEventListener('dragleave', (e) => {
            speedKnobControl.classList.remove('drag-over');
        });

        speedKnobControl.addEventListener('drop', (e) => {
            e.preventDefault();
            speedKnobControl.classList.remove('drag-over');

            const filterOverlay = document.getElementById('filterDropOverlay');
            if (filterOverlay) {
                filterOverlay.classList.remove('active');
            }
            
            const chartSource = e.dataTransfer.getData('text/plain');
            if (!chartSource) return;
            
            // Store BPM assignment
            window.bpmAssignment = chartSource;
            console.log('✅ BPM assigned to:', chartSource);
        });

        // Right-click to remove BPM automation
        speedKnobControl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            if (window.bpmAssignment) {
                const contextMenu = document.getElementById('knobContextMenu');
                if (contextMenu) {
                    // Mark that we're removing BPM assignment
                    contextMenu.dataset.removeBpm = 'true';
                    contextMenu.style.left = `${e.pageX}px`;
                    contextMenu.style.top = `${e.pageY}px`;
                    contextMenu.style.display = 'block';
                }
            }
        });
    }
    
    // Setup mode switch (Presets / MIDI)
    setupModeSwitch();
    
    // Setup knob drag-drop binding
    setupKnobDragDrop();
    
    console.log('✅ UI controls initialized');
}

function setupModeSwitch() {
    const modePresetsBtn = document.getElementById('modePresetsBtn');
    const modeMidiBtn = document.getElementById('modeMidiBtn');
    const modePresetsPanel = document.getElementById('modePresetsPanel');
    const modeMidiPanel = document.getElementById('modeMidiPanel');

    function setMode(mode) {
        const isPresets = mode === 'presets';

        if (modePresetsBtn) {
            modePresetsBtn.classList.toggle('active', isPresets);
            modePresetsBtn.setAttribute('aria-selected', String(isPresets));
        }
        
        if (modeMidiBtn) {
            modeMidiBtn.classList.toggle('active', !isPresets);
            modeMidiBtn.setAttribute('aria-selected', String(!isPresets));
        }

        if (modePresetsPanel) {
            modePresetsPanel.style.display = isPresets ? 'block' : 'none';
        }
        
        if (modeMidiPanel) {
            modeMidiPanel.style.display = isPresets ? 'none' : 'block';
        }

        try {
            if (isPresets) {
                // Disable MIDI when switching to Presets mode
                if (window.audioModule) {
                    window.audioModule.midiEnabled = false;
                    // Ensure proxy does not shadow real samplePlayer/sampleLoadedName
                    delete window.audioModule.samplePlayer;
                    delete window.audioModule.sampleLoadedName;
                }
                const statusEl = document.getElementById('midiStatus');
                if (statusEl) statusEl.textContent = 'MIDI: inattivo';

                // If no sample loaded, reload the current preset
                if (window.audioModule && (!window.audioModule.samplePlayer || !window.audioModule.samplePlayer.buffer)) {
                    const presetSelect = document.getElementById('presetSampleSelect');
                    const presetName = presetSelect && presetSelect.value ? presetSelect.value : 'halo';
                    if (window.audioModule.loadPresetSample) {
                        window.audioModule.loadPresetSample(presetName).catch(e => console.warn('Preset reload failed:', e));
                    }
                }
            } else {
                // Enable MIDI automatically when switching to MIDI mode
                if (window.audioModule) {
                    window.audioModule.midiEnabled = true;
                }
                // Clear proxy shadow to avoid overriding real sample player
                if (window.audioModule) {
                    delete window.audioModule.samplePlayer;
                    delete window.audioModule.sampleLoadedName;
                }
                const status = document.getElementById('sampleStatus');
                if (status) status.textContent = 'Sample Mode: no sample';
                const midiStatus = document.getElementById('midiStatus');
                if (midiStatus) midiStatus.textContent = 'MIDI: attivo';
            }
        } catch (e) {
            console.warn('Mode exclusivity update warning:', e);
        }
    }

    if (modePresetsBtn && modeMidiBtn) {
        modePresetsBtn.addEventListener('click', () => setMode('presets'));
        modeMidiBtn.addEventListener('click', () => setMode('midi'));
        setMode('presets');
    }
}

export function setupKnobDragDrop() {
    // Initialize knobAssignments if not exists
    window.knobAssignments = window.knobAssignments || {};
    
    let draggedChart = null;
    let contextMenuKnob = null;
    const chartBoxes = document.querySelectorAll('[data-chart-source]');
    const contextMenu = document.getElementById('knobContextMenu');
    const removeControlItem = document.getElementById('removeControl');

    function clearDragVisualState() {
        const filterOverlay = document.getElementById('filterDropOverlay');
        if (filterOverlay) {
            filterOverlay.classList.remove('active');
        }

        const allKnobs = document.querySelectorAll('.effect-knob, .knob');
        allKnobs.forEach(knob => {
            knob.classList.remove('glow-available');
            knob.classList.remove('glow-assigned');
            knob.classList.remove('drag-over');
        });

        const speedKnobControl = document.getElementById('speedKnobControl');
        if (speedKnobControl) {
            speedKnobControl.classList.remove('glow-available');
            speedKnobControl.classList.remove('glow-assigned');
            speedKnobControl.classList.remove('drag-over');
        }

        const spectrumCanvas = document.getElementById('spectrumCanvas');
        if (spectrumCanvas) {
            spectrumCanvas.classList.remove('glow-available');
            spectrumCanvas.classList.remove('drag-over');
        }

        chartBoxes.forEach(box => box.classList.remove('dragging'));
    }
    
    function updateKnobVisual(knobElement, chartSource) {
        const effectParam = knobElement.closest('.effect-param');
        if (!effectParam) return;
        
        effectParam.classList.remove('assigned-temp', 'assigned-dens', 'assigned-vel');
        
        if (chartSource === 'Temp') {
            effectParam.classList.add('assigned-temp');
        } else if (chartSource === 'Dens') {
            effectParam.classList.add('assigned-dens');
        } else if (chartSource === 'Vel') {
            effectParam.classList.add('assigned-vel');
        }
    }

    function getNormalizedChartValue(chartSource, index) {
        let chart;
        if (chartSource === 'Temp') {
            chart = window.chartTemp;
        } else if (chartSource === 'Dens') {
            chart = window.chartDens;
        } else if (chartSource === 'Vel') {
            chart = window.chartVel;
        } else {
            return null;
        }

        if (!chart) return null;
        
        const data = chart.data.datasets[0].data;
        if (!data || data.length === 0 || index < 0 || index >= data.length) {
            return null;
        }

        const values = data.map(d => d.y).filter(v => Number.isFinite(v));
        if (values.length === 0) return null;
        
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        
        const currentValue = data[index].y;
        if (!Number.isFinite(currentValue)) return null;
        
        if (range === 0) return 50;
        const normalized = ((currentValue - min) / range) * 100;
        return Math.max(0, Math.min(100, normalized));
    }

    function updateKnobFromChart(knobId, chartSource, index) {
        if (typeof index === 'undefined' || index === null) {
            index = window.highlightIndex || 0;
        }
        if (index < 0) return;

        const normalizedValue = getNormalizedChartValue(chartSource, index);
        if (normalizedValue === null) return;

        const targetValue = normalizedValue / 100;
        
        // Cancel any existing animation for this knob
        window.knobAnimations = window.knobAnimations || {};
        if (window.knobAnimations[knobId]) {
            cancelAnimationFrame(window.knobAnimations[knobId]);
        }
        
        // Get current value - track it globally
        window.knobCurrentValues = window.knobCurrentValues || {};
        const currentValue = window.knobCurrentValues[knobId] !== undefined ? window.knobCurrentValues[knobId] : 0;
        
        // Animation duration (ms)
        const duration = 300;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            // Smooth easing: ease-out-cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate between current and target value
            const interpolatedValue = currentValue + (targetValue - currentValue) * easeProgress;
            
            if (window.setKnobValue && window.setKnobValue[knobId]) {
                window.setKnobValue[knobId](interpolatedValue);
                window.knobCurrentValues[knobId] = interpolatedValue;
            }
            
            if (progress < 1) {
                window.knobAnimations[knobId] = requestAnimationFrame(animate);
            } else {
                // Ensure final value is exact
                if (window.setKnobValue && window.setKnobValue[knobId]) {
                    window.setKnobValue[knobId](targetValue);
                    window.knobCurrentValues[knobId] = targetValue;
                }
            }
        };
        
        window.knobAnimations[knobId] = requestAnimationFrame(animate);
    }

    // Setup chart drag listeners
    chartBoxes.forEach(box => {
        box.addEventListener('dragstart', (e) => {
            draggedChart = box.getAttribute('data-chart-source');
            box.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', draggedChart);
            
            // Highlight all knobs
            const allKnobs = document.querySelectorAll('.effect-knob, .knob');
            allKnobs.forEach(knob => {
                const knobId = knob.id;
                if (!window.knobAssignments[knobId] || window.knobAssignments[knobId] !== draggedChart) {
                    knob.classList.add('glow-available');
                } else {
                    knob.classList.add('glow-assigned');
                }
            });
            
            // Highlight BPM knob
            const speedKnobControl = document.getElementById('speedKnobControl');
            if (speedKnobControl) {
                if (!window.bpmAssignment || window.bpmAssignment !== draggedChart) {
                    speedKnobControl.classList.add('glow-available');
                } else {
                    speedKnobControl.classList.add('glow-assigned');
                }
            }
            
            // Show filter drop overlay
            const filterOverlay = document.getElementById('filterDropOverlay');
            if (filterOverlay) {
                filterOverlay.classList.add('active');
            }
            
            // Highlight spectrum canvas for filter handles
            const spectrumCanvas = document.getElementById('spectrumCanvas');
            if (spectrumCanvas) {
                spectrumCanvas.classList.add('glow-available');
            }
        });

        box.addEventListener('dragend', (e) => {
            box.classList.remove('dragging');
            draggedChart = null;
            clearDragVisualState();
        });
    });

    document.addEventListener('dragend', () => {
        draggedChart = null;
        clearDragVisualState();
    });

    document.addEventListener('drop', () => {
        draggedChart = null;
        clearDragVisualState();
    });

    // Setup knob drop listeners
    const allKnobs = document.querySelectorAll('.effect-knob, .knob');
    allKnobs.forEach(knob => {
        knob.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            knob.classList.add('drag-over');
        });

        knob.addEventListener('dragleave', (e) => {
            knob.classList.remove('drag-over');
        });

        knob.addEventListener('drop', (e) => {
            e.preventDefault();
            knob.classList.remove('drag-over');
            knob.classList.remove('glow-available');
            knob.classList.remove('glow-assigned');

            const filterOverlay = document.getElementById('filterDropOverlay');
            if (filterOverlay) {
                filterOverlay.classList.remove('active');
            }
            
            const chartSource = e.dataTransfer.getData('text/plain');
            const knobId = knob.id;
            
            if (chartSource && knobId) {
                window.knobAssignments[knobId] = chartSource;
                updateKnobVisual(knob, chartSource);
                updateKnobFromChart(knobId, chartSource);
            }
        });

        // Right-click to show context menu
        knob.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            const knobId = knob.id;
            
            if (knobId && window.knobAssignments[knobId]) {
                contextMenuKnob = knobId;
                
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.top = `${e.pageY}px`;
                contextMenu.style.display = 'block';
            }
        });
    });

    // Setup spectrum canvas drop listeners for filter handles
    const spectrumCanvas = document.getElementById('spectrumCanvas');
    if (spectrumCanvas) {
        spectrumCanvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            spectrumCanvas.classList.add('drag-over');
        });

        spectrumCanvas.addEventListener('dragleave', (e) => {
            spectrumCanvas.classList.remove('drag-over');
        });

        spectrumCanvas.addEventListener('drop', (e) => {
            e.preventDefault();
            spectrumCanvas.classList.remove('drag-over');
            spectrumCanvas.classList.remove('glow-available');

            const filterOverlay = document.getElementById('filterDropOverlay');
            if (filterOverlay) {
                filterOverlay.classList.remove('active');
            }
            
            const chartSource = e.dataTransfer.getData('text/plain');
            if (!chartSource) return;
            
            // Get mouse position on canvas
            const rect = spectrumCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Determine which handle is closer (HP is at left, LP is at right)
            const canvasWidth = spectrumCanvas.width;
            const isHP = x < canvasWidth / 2;
            
            // Store assignment for the filter handle
            window.filterHandleAssignments = window.filterHandleAssignments || {};
            
            if (isHP) {
                window.filterHandleAssignments.hp = chartSource;
                updateFilterHandleColor('hp', chartSource);
            } else {
                window.filterHandleAssignments.lp = chartSource;
                updateFilterHandleColor('lp', chartSource);
            }
        });

        // Right-click to show filter context menu
        spectrumCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const filterContextMenu = document.getElementById('filterContextMenu');
            if (!filterContextMenu) return;
            
            filterContextMenu.style.left = e.pageX + 'px';
            filterContextMenu.style.top = e.pageY + 'px';
            filterContextMenu.style.display = 'block';
        });
        
        // Filter context menu item handlers
        const removeHPControl = document.getElementById('removeHPControl');
        const removeLPControl = document.getElementById('removeLPControl');
        const filterContextMenu = document.getElementById('filterContextMenu');
        
        if (removeHPControl) {
            removeHPControl.addEventListener('click', () => {
                window.filterHandleAssignments = window.filterHandleAssignments || {};
                delete window.filterHandleAssignments.hp;
                resetFilterHandleColor('hp');
                if (filterContextMenu) filterContextMenu.style.display = 'none';
            });
        }
        
        if (removeLPControl) {
            removeLPControl.addEventListener('click', () => {
                window.filterHandleAssignments = window.filterHandleAssignments || {};
                delete window.filterHandleAssignments.lp;
                resetFilterHandleColor('lp');
                if (filterContextMenu) filterContextMenu.style.display = 'none';
            });
        }
    }

    function updateFilterHandleColor(handleType, chartSource) {
        const spectrumModule = window.spectrumModule || {};
        let color;
        
        if (chartSource === 'Temp') {
            color = 'rgba(239, 68, 68, 0.9)'; // Red
        } else if (chartSource === 'Dens') {
            color = 'rgba(251, 146, 60, 0.9)'; // Orange
        } else if (chartSource === 'Vel') {
            color = 'rgba(52, 211, 153, 0.9)'; // Green
        }
        
        if (color) {
            if (handleType === 'hp' && spectrumModule.setHPHandleColor) {
                spectrumModule.setHPHandleColor(color);
            } else if (handleType === 'lp' && spectrumModule.setLPHandleColor) {
                spectrumModule.setLPHandleColor(color);
            }
        }
    }

    function resetFilterHandleColor(handleType) {
        const spectrumModule = window.spectrumModule || {};
        
        if (handleType === 'hp' && spectrumModule.resetHPHandleColor) {
            spectrumModule.resetHPHandleColor();
        } else if (handleType === 'lp' && spectrumModule.resetLPHandleColor) {
            spectrumModule.resetLPHandleColor();
        }
    }

    // Handle remove control button
    if (removeControlItem) {
        removeControlItem.addEventListener('click', () => {
            const contextMenu = document.getElementById('knobContextMenu');
            const isBpmRemoval = contextMenu && contextMenu.dataset.removeBpm === 'true';
            
            if (isBpmRemoval) {
                // Remove BPM assignment
                delete window.bpmAssignment;
                console.log('❌ BPM automation removed');
                if (contextMenu) contextMenu.dataset.removeBpm = 'false';
            } else if (contextMenuKnob) {
                // Remove effect knob assignment
                const knobElement = document.getElementById(contextMenuKnob);
                if (knobElement) {
                    const effectParam = knobElement.closest('.effect-param');
                    if (effectParam) {
                        effectParam.classList.remove('assigned-temp', 'assigned-dens', 'assigned-vel');
                    }
                }
                delete window.knobAssignments[contextMenuKnob];
                contextMenuKnob = null;
            }
            if (contextMenu) contextMenu.style.display = 'none';
        });
    }

    // Close context menu on click elsewhere
    document.addEventListener('click', (e) => {
        const contextMenu = document.getElementById('knobContextMenu');
        const filterContextMenu = document.getElementById('filterContextMenu');
        if (contextMenu && !contextMenu.contains(e.target) && !e.target.closest('.effect-knob, .knob')) {
            contextMenu.style.display = 'none';
        }
        if (filterContextMenu && !filterContextMenu.contains(e.target) && e.target.id !== 'spectrumCanvas') {
            filterContextMenu.style.display = 'none';
        }
    });

    window.updateAllAssignedKnobs = function(index) {
        if (typeof index === 'undefined' || index === null) {
            index = window.highlightIndex || 0;
        }
        
        Object.keys(window.knobAssignments).forEach(knobId => {
            const chartSource = window.knobAssignments[knobId];
            updateKnobFromChart(knobId, chartSource, index);
        });
        
        // Also update filter handles if assigned
        window.filterHandleAssignments = window.filterHandleAssignments || {};
        
        if (window.filterHandleAssignments.hp) {
            updateFilterFromChart('hp', window.filterHandleAssignments.hp, index);
        }
        
        if (window.filterHandleAssignments.lp) {
            updateFilterFromChart('lp', window.filterHandleAssignments.lp, index);
        }
        
        // Update BPM if assigned
        if (window.bpmAssignment) {
            updateBpmFromChart(window.bpmAssignment, index);
        }
    };
    
    function updateBpmFromChart(chartSource, index) {
        if (typeof index === 'undefined' || index === null) {
            index = window.highlightIndex || 0;
        }
        if (index < 0) return;

        const normalizedValue = getNormalizedChartValue(chartSource, index);
        if (normalizedValue === null) return;

        const minBpm = 40;
        const maxBpm = 500;
        const newBpm = Math.round(minBpm + (normalizedValue / 100) * (maxBpm - minBpm));
        
        const msToBpm = (ms) => Math.round(60000 / ms);
        const bpmToMs = (bpm) => Math.round(60000 / bpm);
        const newMs = bpmToMs(newBpm);
        
        // Update speedKnobControl rotation
        const speedKnobControl = document.getElementById('speedKnobControl');
        if (speedKnobControl) {
            const normalized = (newBpm - minBpm) / (maxBpm - minBpm);
            const angle = -135 + (normalized * 270);
            speedKnobControl.style.transform = `rotate(${angle}deg)`;
        }
        
        // Update speedValue display
        const speedValue = document.getElementById('speedValue');
        if (speedValue) {
            speedValue.textContent = `${newBpm} BPM`;
        }
        
        // Update Tone Transport BPM
        if (typeof Tone !== 'undefined' && Tone.Transport) {
            Tone.Transport.bpm.value = newBpm;
        }
        
        console.log('🎼 BPM updated to:', newBpm);
    }

    function updateFilterFromChart(filterType, chartSource, index) {
        if (typeof index === 'undefined' || index === null) {
            index = window.highlightIndex || 0;
        }
        if (index < 0) return;

        const normalizedValue = getNormalizedChartValue(chartSource, index);
        if (normalizedValue === null) return;

        // Map normalized value (0-100) to frequency range (20Hz - 20kHz) logarithmically
        const minFreq = 20;
        const maxFreq = 20000;
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        
        const normalizedFraction = normalizedValue / 100; // 0 to 1
        const logFreq = logMin + normalizedFraction * (logMax - logMin);
        const frequency = Math.pow(10, logFreq);
        
        // Update the filter frequency
        if (filterType === 'hp' && window.setEQHighpassFreq) {
            window.setEQHighpassFreq(frequency);
        } else if (filterType === 'lp' && window.setEQLowpassFreq) {
            window.setEQLowpassFreq(frequency);
        }
    }
}