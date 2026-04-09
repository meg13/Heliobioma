import { resolveColorToRgba, COLOR_MAP, interpolateLinear, removeVelocityAnomalies } from './utils.js';

// Track last data timestamp for new data detection
let lastDataTimestamp = 0;

export const lineShadowPlugin = {
    id: 'lineShadow',
    beforeDatasetDraw(chart, args, options) {
        const {ctx} = chart;
        const datasetIndex = args.index;
        const meta = chart.getDatasetMeta(datasetIndex);
        const ds = chart.data.datasets[datasetIndex];
        if (!meta || !meta.data || meta.data.length === 0) return;
        ctx.save();
        const base = COLOR_MAP[ds.borderColor] || ds.borderColor || '#000';
        ctx.shadowColor = resolveColorToRgba(base, options.alpha ?? 0.18);
        ctx.shadowBlur = options.blur || 10;
        ctx.shadowOffsetY = options.offsetY || 2;
        ctx.beginPath();
        meta.data.forEach((el, i) => {
            const p = el.getProps(['x','y'], true);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.lineWidth = ds.borderWidth || 2;
        ctx.strokeStyle = ds.borderColor || '#000';
        ctx.stroke();
        ctx.restore();
    }
};

export const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw(chart) {
        const ctx = chart.ctx;
        const tooltip = chart.tooltip;
        if (!tooltip || !tooltip._active || tooltip._active.length === 0) return;
        const active = tooltip._active[0];
        const x = active.element.x;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chart.chartArea.top);
        ctx.lineTo(x, chart.chartArea.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(2,6,23,0.06)';
        ctx.stroke();
        ctx.restore();
    }
};

export const horizontalSectionsPlugin = {
    id: 'horizontalSections',
    afterDraw(chart, args, options) {
        if (!chart.isHorizontalSections) return;
        const ctx = chart.ctx;
        const keyboard = document.getElementById('keyboardContainer');
        if (!keyboard) return;
        
        const keys = keyboard.querySelectorAll('.key');
        const numKeys = keys.length;
        const chartArea = chart.chartArea;
        const sectionHeight = (chartArea.bottom - chartArea.top) / numKeys;
        
        ctx.save();
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        
        for (let i = 0; i <= numKeys; i++) {
            const y = chartArea.top + i * sectionHeight;
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
        }
        ctx.restore();
    }
};

export const dataPointLinesPlugin = {
    id: 'dataPointLines',
    // Draw after datasets but before tooltip so the tooltip stays on top
    afterDatasetsDraw(chart, args, options) {
        const cfg = chart && chart.options && chart.options.plugins && chart.options.plugins.dataPointLines;
        if (!cfg) return;

        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) return;
        
        if (!window.originalDataXs || window.originalDataXs.length === 0) return;
        
        const xs = window.originalDataXs;
        let ys = [];
        
        if (chart === window.chartTemp && window.originalDataTemp) ys = window.originalDataTemp;
        else if (chart === window.chartDens && window.originalDataDens) ys = window.originalDataDens;
        else if (chart === window.chartVel && window.originalDataVel) ys = window.originalDataVel;
        else if (chart.canvas.id === 'chartPreview' && window.originalDataYs) ys = window.originalDataYs;
        
        const chartArea = chart.chartArea;
        const scale = chart.scales.x;
        const yScale = chart.scales.y;
        
        ctx.save();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(255,193,7,0.05)';
        
        xs.forEach((xTime, idx) => {
            const xPx = scale.getPixelForValue(xTime);
            if (xPx >= chartArea.left && xPx <= chartArea.right) {
                ctx.beginPath();
                ctx.moveTo(xPx, chartArea.top);
                ctx.lineTo(xPx, chartArea.bottom);
                ctx.stroke();
            }
        });
        
        let closestIdx = -1;
        if (typeof window.highlightIndex === 'number' && window.highlightIndex >= 0 && meta.data[window.highlightIndex]) {
            const highlightXPx = meta.data[window.highlightIndex].x;
            let minDist = Infinity;
            
            xs.forEach((xTime, idx) => {
                const xPx = scale.getPixelForValue(xTime);
                const dist = Math.abs(xPx - highlightXPx);
                if (dist < minDist) {
                    minDist = dist;
                    closestIdx = idx;
                }
            });
        }
        
        xs.forEach((xTime, idx) => {
            if (ys && ys[idx] !== undefined) {
                const xPx = scale.getPixelForValue(xTime);
                const yPx = yScale.getPixelForValue(ys[idx]);
                
                if (xPx >= chartArea.left && xPx <= chartArea.right &&
                    yPx >= chartArea.top && yPx <= chartArea.bottom) {
                    
                    const isClosest = idx === closestIdx;
                    const radius = isClosest ? 7 : 3.5;
                    const fillAlpha = isClosest ? 1 : 0.7;
                    const strokeAlpha = isClosest ? 1 : 1;
                    
                    if (isClosest) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                        ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
                        ctx.lineWidth = 3;
                    } else {
                        ctx.fillStyle = `rgba(255,193,7,${fillAlpha})`;
                        ctx.strokeStyle = `rgba(255,193,7,${strokeAlpha})`;
                        ctx.lineWidth = 1.5;
                    }
                    
                    if (isClosest) {
                        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
                        ctx.shadowBlur = 15;
                    }
                    
                    ctx.beginPath();
                    ctx.arc(xPx, yPx, radius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                    
                    if (isClosest) {
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                    }
                }
            }
        });
        
        ctx.restore();
    }
};

export const newPointPulsePlugin = {
    id: 'newPointPulse',
    afterDraw(chart) {
        if (!chart.pulseEffect) return;
        
        const ctx = chart.ctx;
        const elapsed = Date.now() - chart.pulseEffect.startTime;
        const duration = 3000; // 3 seconds
        
        if (elapsed >= duration) {
            chart.pulseEffect = null;
            return;
        }
        
        const progress = elapsed / duration;
        const maxRadius = 60;
        const radius = progress * maxRadius;
        const alpha = 1 - progress;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(chart.pulseEffect.x, chart.pulseEffect.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `rgba(251, 191, 36, ${alpha})`;
        ctx.stroke();
        ctx.restore();
        
        // Continue animation
        requestAnimationFrame(() => chart.draw());
    }
};

export function registerChartPlugins() {
    Chart.register(lineShadowPlugin, verticalLinePlugin, horizontalSectionsPlugin, dataPointLinesPlugin, newPointPulsePlugin);
}

export function createChart(canvasId, color, isPreview = false) {
    const chart = new Chart(document.getElementById(canvasId), {
        type: "line",
        data: {
            datasets: [{
                borderColor: color,
                borderWidth: 1.5,
                tension: 0.43,
                fill: true,
                backgroundColor: (ctx) => {
                    const chart = ctx.chart;
                    const {ctx: c, chartArea} = chart;
                    if (!chartArea) return resolveColorToRgba(COLOR_MAP[color] || color, 0.13);
                    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    const base = COLOR_MAP[color] || color;
                    g.addColorStop(0, resolveColorToRgba(base, 0.2));
                    g.addColorStop(0.6, resolveColorToRgba(base, 0.1));
                    g.addColorStop(1, resolveColorToRgba(base, 0));
                    return g;
                },
                pointRadius: 0,
                pointBackgroundColor: 'rgba(0,0,0,0)',
                pointBorderColor: 'rgba(0,0,0,0)',
                hoverRadius: 0
            }]  
        },
        options: {
            animation: false,
            interaction: { mode: 'nearest', intersect: false },
            maintainAspectRatio: false,
            layout: { padding: 10 },

            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "yyyy-MM-dd HH:mm",
                        displayFormats: {
                            hour: "HH:mm",
                            minute: "HH:mm"
                        }
                    },
                    display: false,
                    ticks: {
                        maxTicksLimit: 5,
                        color: '#64748b',
                        font: { family: 'Space Mono, monospace', size: 11 }
                    },
                    grid: { display: false, color: 'transparent' }
                },

                y: {
                    display: false,
                    ticks: {
                        color: '#64748b',
                        font: { family: 'Space Mono, monospace', size: 11 }
                    },
                    grid: { display: false, color: 'rgba(2,6,23,0.04)', borderDash: [4,4] }
                }
            },

            plugins: {
                legend: { display: false },

                tooltip: {
                    enabled: !!isPreview,
                    mode: 'nearest',
                    intersect: false,
                    backgroundColor: 'rgba(2,6,23,0.78)',
                    titleFont: { family: 'Space Mono, monospace', size: 12, weight: '700' },
                    bodyFont: { family: 'Space Mono, monospace', size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label || ''}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : '-'}`
                    }
                },

                lineShadow: { blur: 8, offsetY: 2 },
                verticalLine: {},
                horizontalSections: isPreview ? {} : false,
                dataPointLines: isPreview ? {} : false
            }
        }
    });

    if (isPreview) chart.isHorizontalSections = true;
    
    return chart;
}

export let highlightIndex = -1;
export let highlightTimer = null;
export let highlightSpeed = 750;
export let quantizeTimer = null;
export let highlightIndexTime = -1;
export let transportLoopId = null;
export let originalPointIndices = [];
export let currentOriginalPointIndex = -1;
export let lastProcessedOriginalPointIndex = -1;
export let xSpacing = 5;

function processMovingDotForIndex(idx, time) {
    try {
        if (!window.originalDataXs || !window.originalDataXs.length) {
            console.warn('No original data');
            return;
        }
        
        if (originalPointIndices && originalPointIndices.length > 0) {
            const ys = window.originalDataYs || window.originalDataTemp || [];
            const dataIndex = currentOriginalPointIndex;
            
            console.log('Processing:', { dataIndex, lastProcessedOriginalPointIndex, ysLength: ys.length });
            
            if (dataIndex >= 0 && dataIndex < ys.length) {
                if (dataIndex !== lastProcessedOriginalPointIndex) {
                    const yVal = ys[dataIndex];
                    
                    if (Number.isFinite(yVal)) {
                        lastProcessedOriginalPointIndex = dataIndex;

                        let minY, maxY;
                        if (chartPreview && chartPreview.scales && chartPreview.scales.y) {
                            minY = chartPreview.scales.y.min;
                            maxY = chartPreview.scales.y.max;
                        } else {
                            const numericYs = ys.filter(v => Number.isFinite(v));
                            minY = numericYs.length ? Math.min(...numericYs) : 0;
                            maxY = numericYs.length ? Math.max(...numericYs) : 100;
                        }

                        // Get visible MIDI range from keyboard
                        let midiStart = 48, midiEnd = 83;
                        if (window.getVisibleMidiRange) {
                            const range = window.getVisibleMidiRange();
                            midiStart = range.start;
                            midiEnd = range.end;
                        }
                        
                        let midi = midiStart;
                        if (maxY !== minY) {
                            const ratio = (yVal - minY) / (maxY - minY);
                            midi = Math.round(midiStart + ratio * (midiEnd - midiStart));
                            midi = Math.max(midiStart, Math.min(midiEnd, midi));
                        }

                        console.log('Computed MIDI:', midi, 'from value:', yVal, 'range:', minY, maxY, 'MIDI range:', midiStart, '-', midiEnd);

                        const keyboard = document.getElementById('verticalKeyboard');
                        if (keyboard) {
                            for (let k = 0; k < keyboard.children.length; k++) {
                                keyboard.children[k].classList.remove('quantizedKey');
                            }
                            
                            for (let k = 0; k < keyboard.children.length; k++) {
                                const el = keyboard.children[k];
                                if (el && el.dataset && Number(el.dataset.midi) === midi) {
                                    el.classList.add('quantizedKey');
                                    
                                    // Call directly without async import to preserve timing
                                    if (window.triggerPlayWithFallback) {
                                        console.log('Calling triggerPlayWithFallback for MIDI:', midi);
                                        window.triggerPlayWithFallback(midi, time);
                                    } else {
                                        console.warn('triggerPlayWithFallback not available on window');
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            return;
        }
    } catch (e) {
        console.warn("Errore process audio:", e);
    }
}

export function setHighlightIndex(idx) {
    highlightIndex = idx;
}

export function setHighlightSpeed(ms) {
    highlightSpeed = ms;
}

export async function updateCharts() {
    try {
        const url = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json';
        const resp = await fetch(url, { cache: 'no-store' });
        
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        
        const text = await resp.text();
        if (!text || text.trim().length === 0) {
            console.error('Empty response from NOAA API');
            throw new Error('Empty response from server');
        }
        
        console.log('Response length:', text.length, 'First 100 chars:', text.substring(0, 100));
        
        let raw;
        try {
            raw = JSON.parse(text);
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr.message);
            console.error('Raw response:', text.substring(0, 500));
            throw parseErr;
        }
        
        if (typeof raw[0][0] === 'string') raw.shift();
        
        const pts = raw.map(r => ({
            t: new Date(r[0]),
            dens: Number(r[1]),
            vel: Number(r[2]),
            temp: Number(r[3])
        })).filter(p => !isNaN(p.t));
        
        pts.sort((a, b) => a.t - b.t);
        
        const ONE_HOUR = 60 * 60 * 1000;
        const maxTime = pts.length ? pts[pts.length - 1].t.getTime() : Date.now();
        const ptsUsed = pts.filter(p => p.t.getTime() >= maxTime - ONE_HOUR);
        
        const xs = ptsUsed.map(p => p.t.getTime());
        const dens = ptsUsed.map(p => p.dens);
        const vel = ptsUsed.map(p => p.vel);
        const temp = ptsUsed.map(p => p.temp);
        
        // Applica filtraggio anomalie ai dati di velocità
        const { corrected: velCorrected, originals: velOriginals, anomalyIndices } = removeVelocityAnomalies(vel);
        
        window.originalDataXs = xs;
        window.originalDataTemp = temp;
        window.originalDataDens = dens;
        //window.originalDataVel = velOriginals;  // Mantieni i valori originali per il tooltip
        window.originalDataVel = velCorrected;  // versione provvisoria, in attesa di decidere se mostrare o meno le anomalie nei tooltip
        window.velocityCorrected = velCorrected;  // Usa i valori corretti per il grafico
        window.originalDataYs = temp;
        
        if (anomalyIndices.length > 0) {
            console.log(`✓ Filtrate ${anomalyIndices.length} anomalie nel grafico di velocità`);
        }
        
        // Check for new data and trigger pulse effect
        if (xs.length > 0) {
            const currentLatestTime = xs[xs.length - 1];
            if (lastDataTimestamp > 0 && currentLatestTime > lastDataTimestamp) {
                // New data detected! Trigger pulse on preview chart
                if (window.chartPreview) {
                    // Wait for chart update to complete before getting coordinates
                    setTimeout(() => {
                        const meta = window.chartPreview.getDatasetMeta(0);
                        if (meta && meta.data && meta.data.length > 0) {
                            const lastPt = meta.data[meta.data.length - 1];
                            if (lastPt && lastPt.x !== undefined && lastPt.y !== undefined) {
                                window.chartPreview.pulseEffect = {
                                    x: lastPt.x,
                                    y: lastPt.y,
                                    startTime: Date.now()
                                };
                                window.chartPreview.draw();
                                console.log('✨ New data pulse triggered');
                            }
                        }
                    }, 100);
                }
            }
            lastDataTimestamp = currentLatestTime;
        }
        
        const NUM = 300;
        let minX = Math.min(...xs);
        let maxX = Math.max(...xs);
        if (minX === maxX) maxX = minX + 1;
        const newXs = Array.from({length: NUM}, (_, i) =>
            minX + (i / (NUM - 1)) * (maxX - minX)
        ).filter(x => x >= minX && x <= maxX);
        
        const tempInterp = interpolateLinear(xs, temp, newXs);
        const densInterp = interpolateLinear(xs, dens, newXs);
        const velInterp = interpolateLinear(xs, velCorrected, newXs);
        
        originalPointIndices = [];
        for (let i = 0; i < xs.length; i++) {
            const originalX = xs[i];
            let closestIdx = 0;
            let minDist = Math.abs(newXs[0] - originalX);
            for (let j = 1; j < newXs.length; j++) {
                const dist = Math.abs(newXs[j] - originalX);
                if (dist < minDist) {
                    minDist = dist;
                    closestIdx = j;
                }
            }
            originalPointIndices.push(closestIdx);
        }
        
        if (window.chartTemp) {
            window.chartTemp.data.datasets[0].data = newXs.map((x, i) => ({ x, y: tempInterp[i] }));
            window.chartTemp.update('none');
        }
        
        if (window.chartDens) {
            window.chartDens.data.datasets[0].data = newXs.map((x, i) => ({ x, y: densInterp[i] }));
            window.chartDens.update('none');
        }
        
        if (window.chartVel) {
            window.chartVel.data.datasets[0].data = newXs.map((x, i) => ({ x, y: velInterp[i] }));
            window.chartVel.update('none');
        }
        
        if (window.updatePreview) {
            window.updatePreview();
        }
        
        console.log(`Charts updated: ${xs.length} original points (last hour) → ${NUM} interpolated`);
        
    } catch (e) {
        console.error('Error updating charts:', e.message);
        console.error('Stack:', e.stack);
    }
}

let chartTemp = null;
let chartDens = null;
let chartVel = null;
let chartPreview = null;
let selectedChartSource = 'Temp';
let currIdxTime = null;
let realHighlightIndex = -1;

export function initCharts() {
    chartTemp = createChart("chartTemp", "red");
    chartDens = createChart("chartDens", "orange");
    chartVel = createChart("chartVel", "green");
    
    chartTemp.data.datasets[0].label = "Temperature (K)";
    chartDens.data.datasets[0].label = "Density (protons/cm^3)";
    chartVel.data.datasets[0].label = "Speed (km/s)";
    
    window.chartTemp = chartTemp;
    window.chartDens = chartDens;
    window.chartVel = chartVel;
    window.highlightIndex = highlightIndex;
    window.updatePreview = () => updatePreview(selectedChartSource);
    
    setupChartBoxListeners();
    ensurePreviewChart();
    updateCharts();
    
    // Update charts every 15 seconds
    setInterval(() => {
        console.log('🔄 Auto-updating charts...');
        updateCharts();
    }, 15000);
    
    console.log('✅ Charts initialized with auto-update');
}

function setupChartBoxListeners() {
    const chartBoxes = document.querySelectorAll('.chart-box');
    chartBoxes.forEach(box => {
        box.addEventListener('click', () => {
            const src = box.getAttribute('data-chart-source');
            if (src) setSelectedChart(src);
        });
    });
}

function ensurePreviewChart() {
    if (chartPreview) return;
    const canvas = document.getElementById('chartPreview');
    if (!canvas) return;
    
    syncPreviewHeight();
    
    chartPreview = createChart('chartPreview', 'green', true);
    chartPreview.data.datasets[0].data = [];
    chartPreview.update('none');
    chartPreview.isHorizontalSections = true;
    
    window.chartPreview = chartPreview;
    
    setupPreviewKeyboardSync();
    setupPreviewZoomControls();
}

function syncPreviewHeight() {
    const canvas = document.getElementById('chartPreview');
    if (!canvas) return;

    const previewBox = canvas.closest('.preview-box');
    if (!previewBox) return;

    const kbCont = document.getElementById('keyboardContainer');
    const devicePR = window.devicePixelRatio || 1;

    let keyboardHeight = 0;
    if (kbCont) {
        keyboardHeight = Math.max(kbCont.offsetHeight || 0, kbCont.scrollHeight || 0);
    } else {
        keyboardHeight = previewBox.clientHeight;
    }

    try { previewBox.style.height = keyboardHeight + 'px'; } catch (e) {}

    const padding = 30;
    const cssWidth = Math.max(200, Math.floor(previewBox.clientWidth - padding));
    const cssHeight = Math.max(100, Math.floor(previewBox.clientHeight - padding));

    try {
        canvas.width = Math.round(cssWidth * devicePR);
        canvas.height = Math.round(cssHeight * devicePR);
        canvas.style.width = cssWidth + 'px';
        canvas.style.height = cssHeight + 'px';
    } catch (e) {}

    if (chartPreview) {
        try { chartPreview.resize(); chartPreview.update('none'); } catch (e) {}
    }
}

let __kbPreviewRO;
function setupPreviewKeyboardSync() {
    try {
        const kbCont = document.getElementById('keyboardContainer');
        if (!kbCont || typeof ResizeObserver === 'undefined') return;
        if (__kbPreviewRO) { try { __kbPreviewRO.disconnect(); } catch (_) {} }
        __kbPreviewRO = new ResizeObserver(() => {
            syncPreviewHeight();
        });
        __kbPreviewRO.observe(kbCont);
    } catch (e) {}
}

function setupPreviewZoomControls() {
    const canvas = document.getElementById('chartPreview');
    if (!canvas || canvas.__kbZoomBound) return;

    canvas.addEventListener('wheel', (e) => {
        if (typeof window.adjustKeyboardKeyCount !== 'function') return;
        e.preventDefault();

        const step = e.deltaY < 0 ? -1 : 1;
        window.adjustKeyboardKeyCount(step);
        if (window.chartPreview) {
            try { window.chartPreview.update('none'); } catch (err) {}
        }
    }, { passive: false });

    canvas.__kbZoomBound = true;
}

function setSelectedChart(source) {
    selectedChartSource = source || 'Temp';
    updateChartSelectionUI();
    updatePreview(selectedChartSource);
}

function updateChartSelectionUI() {
    const boxes = document.querySelectorAll('.chart-box');
    boxes.forEach(box => {
        const src = box.getAttribute('data-chart-source');
        if (src === selectedChartSource) box.classList.add('chart-selected');
        else box.classList.remove('chart-selected');
    });
}

function updatePreview(param = selectedChartSource) {
    if (!chartPreview) ensurePreviewChart();
    if (!chartPreview) return;
    
    let src = chartVel;
    if (param === 'Temp') src = chartTemp;
    else if (param === 'Dens') src = chartDens;
    else if (param === 'Vel') src = chartVel;

    const srcDs = src.data.datasets[0];
    chartPreview.data.datasets[0].data = srcDs.data.slice();
    chartPreview.data.datasets[0].borderColor = srcDs.borderColor;
    chartPreview.data.datasets[0].backgroundColor = srcDs.backgroundColor;
    chartPreview.data.datasets[0].label = srcDs.label;

    if (param === 'Temp') window.originalDataYs = window.originalDataTemp || [];
    else if (param === 'Dens') window.originalDataYs = window.originalDataDens || [];
    else if (param === 'Vel') window.originalDataYs = window.originalDataVel || [];

    chartPreview.options.plugins.dataPointLines = {};
    try { chartPreview.update('none'); } catch (e) {}
}

function indexToTime(chart, idx) {
    if (!chart || !chart.data.datasets[0].data[idx]) return -1;
    return chart.data.datasets[0].data[idx].x;
}

function advanceHighlight(time) {
    const len = chartTemp.data.datasets[0].data.length;
    if (!len) return;

    if (originalPointIndices && originalPointIndices.length > 0) {
        const prevIndex = currentOriginalPointIndex;
        currentOriginalPointIndex = (currentOriginalPointIndex + 1) % originalPointIndices.length;
        
        if (prevIndex >= 0 && currentOriginalPointIndex === 0) {
            lastProcessedOriginalPointIndex = -1;
        }
        
        highlightIndex = originalPointIndices[currentOriginalPointIndex];
        realHighlightIndex = highlightIndex;
    } else {
        const originalCount = window.originalDataXs ? window.originalDataXs.length : 60;
        const skipPoints = Math.max(1, Math.round(len / originalCount));
        let next = highlightIndex + skipPoints;
        if (next >= len) {
            next = 0;
            lastProcessedOriginalPointIndex = -1;
        }
        highlightIndex = next;
        realHighlightIndex = next;
    }
    
    window.highlightIndex = highlightIndex;
    currIdxTime = indexToTime(chartTemp, highlightIndex);
    
    if(currIdxTime !== highlightIndexTime) {
        highlightIndexTime = currIdxTime;
        processMovingDotForIndex(highlightIndex, time);
    }

    // Update assigned knobs with current chart values
    if (typeof window.updateAllAssignedKnobs === 'function') {
        window.updateAllAssignedKnobs(highlightIndex);
    }

    if (typeof Tone !== 'undefined') {
        Tone.Draw.schedule(() => {
            updateHighlightRender();
        }, time);
    }
}

function updateHighlightRender() {
    if (chartTemp) chartTemp.update("none");
    if (chartDens) chartDens.update("none");
    if (chartVel) chartVel.update("none");
    if (chartPreview) {
        try { chartPreview.update("none"); } catch (e) {}
    }
}

export function startTransport(speedMs = 200) {
    if (typeof Tone !== 'undefined') {
        try {
            if (Tone.context.state !== 'running') {
                Tone.start();
            }
        } catch (e) {
            console.warn('Failed to start Tone context:', e);
        }
    }
    
    if (!chartTemp || !chartTemp.data.datasets[0].data.length) {
        realHighlightIndex = -1;
        highlightIndex = -1;
        window.highlightIndex = -1;
        highlightTimer = setInterval(() => {
            if (chartTemp && chartTemp.data.datasets[0].data.length) {
                clearInterval(highlightTimer);
                highlightTimer = 'transport';
                if (typeof Tone !== 'undefined' && Tone.Transport.state !== 'started') {
                    Tone.Transport.start();
                }
            }
        }, 200);
        return;
    }

    if (highlightIndex === -1 || realHighlightIndex === -1) {
        currentOriginalPointIndex = -1;
        highlightIndex = -1;
        realHighlightIndex = -1;
        lastProcessedOriginalPointIndex = -1;
    }
    
    highlightSpeed = speedMs;
    highlightTimer = 'transport';
    
    let toneDuration = '2n';
    
    if (typeof Tone !== 'undefined') {
        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
        
        // Schedule repeating highlight advancement
        // Convert speedMs to Tone.js time notation
        // speedMs = 750 -> roughly 2n (half note at 120 BPM = 1000ms)
        toneDuration = speedMs > 500 ? '2n' : '4n';
        transportLoopId = Tone.Transport.scheduleRepeat((time) => {
            advanceHighlight(time);
        }, toneDuration);
    } else {
        // Fallback to simple interval if Tone not available
        highlightTimer = setInterval(() => {
            advanceHighlight(Tone.now?.() || Date.now());
        }, speedMs);
    }
    
    console.log('Transport started, speedMs:', speedMs, 'duration:', toneDuration, 'BPM:', typeof Tone !== 'undefined' ? Tone.Transport.bpm.value : 'N/A');
}

export function stopTransport() {
    if (typeof Tone !== 'undefined' && Tone.Transport && Tone.Transport.state === 'started') {
        Tone.Transport.pause();
        console.log('Transport paused');
    }
    
    if (transportLoopId !== null) {
        if (typeof Tone !== 'undefined') {
            Tone.Transport.clear(transportLoopId);
        }
        transportLoopId = null;
    }
    
    if (highlightTimer && highlightTimer !== 'transport') {
        clearInterval(highlightTimer);
    }
    highlightTimer = null;

        // Ensure any MIDI note playing from transport is stopped
    import('./midi.js').then(mod => {
        if (mod && typeof mod.panicMidi === 'function') {
            mod.panicMidi();
        }
    }).catch(() => {});
}

export function resetTransport() {
    stopTransport();
    highlightIndex = -1;
    realHighlightIndex = -1;
    highlightIndexTime = null;
    currIdxTime = null;
    currentOriginalPointIndex = -1;
    lastProcessedOriginalPointIndex = -1;
    window.highlightIndex = -1;
    
    if (typeof Tone !== 'undefined' && Tone.Transport) {
        Tone.Transport.stop();
        Tone.Transport.position = 0;
    }
    
    updateHighlightRender();
}
