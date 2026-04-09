export function interpolateLinear(xs, ys, newXs) {
    const out = [];
    for (let i = 0; i < newXs.length; i++) {
        const x = newXs[i];
        let j = 0;
        while (j < xs.length - 2 && x > xs[j + 1]) j++;
        const x0 = xs[j], x1 = xs[j + 1];
        const y0 = ys[j], y1 = ys[j + 1];
        const t = (x - x0) / (x1 - x0);
        out.push(y0 * (1 - t) + y1 * t);
    }
    return out;
}

export function resolveColorToRgba(color, alpha = 1) {
    try {
        const cvs = document.createElement('canvas');
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = color;
        const resolved = ctx.fillStyle;

        if (resolved[0] === '#') {
            let hex = resolved.slice(1);
            if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
            const r = parseInt(hex.slice(0,2),16);
            const g = parseInt(hex.slice(2,4),16);
            const b = parseInt(hex.slice(4,6),16);
            return `rgba(${r},${g},${b},${alpha})`;
        }

        const m = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9\.]+))?\)/);
        if (m) {
            const r = m[1], g = m[2], b = m[3];
            return `rgba(${r},${g},${b},${alpha})`;
        }

        return color;
    } catch (e) {
        return color;
    }
}

export const COLOR_MAP = { red: '#ef4444', orange: '#fb923c', green: '#34d399' };

export function msToBpm(ms) {
    return Math.round(60000 / ms);
}

export function bpmToMs(bpm) {
    return Math.round(60000 / bpm);
}

/**
 * Rileva e corregge le anomalie nei dati di velocità
 * Sostituisce valori anomali con il valore precedente valido
 * mantenendo i valori originali per il tooltip
 * 
 * @param {number[]} data - Array dei dati
 * @param {number} threshold - Percentuale minima di variazione rispetto a media (default: 0.15 = 15%)
 * @returns {object} {corrected: [...], originals: [...], anomalyIndices: [...]}
 */
export function removeVelocityAnomalies(data, threshold = 0.15) {
    if (!data || data.length < 3) return { corrected: data, originals: data, anomalyIndices: [] };
    
    const originals = [...data];
    const corrected = [...data];
    const anomalyIndices = [];
    
    // Calcola media e deviazione standard
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length;
    const stdDev = Math.sqrt(variance);
    
    // Usa deviazione standard per identificare outlier
    // Un valore è anomalo se è minore di (mean - 2*stdDev) 
    // oppure se è < threshold% della media circostante
    const lowerBound = Math.max(mean - 2 * stdDev, mean * 0.1);
    
    let lastValidValue = data[0];
    
    for (let i = 0; i < data.length; i++) {
        const val = data[i];
        
        // Verifica se il valore è un'anomalia
        const isAnomaly = val < lowerBound || (i > 0 && val < lastValidValue * threshold);
        
        if (isAnomaly) {
            corrected[i] = lastValidValue;
            anomalyIndices.push(i);
            console.warn(`🚨 Anomalia rilevata a indice ${i}: ${val} → sostituito con ${lastValidValue}`);
        } else {
            lastValidValue = val;
        }
    }
    
    return { corrected, originals, anomalyIndices };
}
