console.log('Solar Synth - Inizializzazione...');

import { initCharts, startTransport, stopTransport, resetTransport, registerChartPlugins } from './charts.js';
import { ensureToneStarted, initAudioUI, metronomeEnabled, audioState } from './audio.js';
import { initKeyboard, triggerPlayWithFallback, getVisibleMidiRange, adjustKeyboardKeyCount } from './keyboard.js';
import { initMidiUI } from './midi.js';
import { initRecorderUI } from './recorder.js';
import { initUI } from './ui.js';
import { initTutorial } from './tutorial.js';
import { initLivePlantingSync } from './liveplanting-sync.js';
import './spectrum.js';

console.log('Moduli caricati con successo');

registerChartPlugins();

window.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Pronto - Solar Synth attivo');

    try {
        initKeyboard();
        initCharts();
        await initAudioUI();
        await initMidiUI();
        initRecorderUI();
        initUI();
        initTutorial();

        // Export functions and modules to window for Transport callbacks
        window.startTransport = startTransport;
        window.stopTransport = stopTransport;
        window.resetTransport = resetTransport;
        window.triggerPlayWithFallback = triggerPlayWithFallback;
        window.getVisibleMidiRange = getVisibleMidiRange;
        window.adjustKeyboardKeyCount = adjustKeyboardKeyCount;

        // Import audio module and create mutable proxy
        const audioModule = await import('./audio.js');

        // Create a proxy that reads from audioState first, then from audioModule
        window.audioModule = new Proxy(audioState, {
            get(target, prop) {
                // If property is in audioState, return from there
                if (prop in target) return target[prop];
                // Otherwise return from audioModule
                return audioModule[prop];
            }
        });

        // Sync bridge verso LivePlanting / sync server
        window.livePlantingSync = initLivePlantingSync({
            wsUrl: 'ws://127.0.0.1:8765',
            intervalMs: 100
        });

        // Export MIDI module
        window.midiModule = await import('./midi.js');

        // Export EQ setter functions for spectrum.js
        window.setEQHighpassFreq = audioModule.setEQHighpassFreq;
        window.setEQLowpassFreq = audioModule.setEQLowpassFreq;
        window.setEQHighpassRolloff = audioModule.setEQHighpassRolloff;
        window.setEQLowpassRolloff = audioModule.setEQLowpassRolloff;

        window.setMetronomeEnabled = async (enabled) => {
            const audio = await import('./audio.js');
            audio.metronomeEnabled = enabled;
        };

        // Setup spectrum canvas interaction after window.setEQ* functions are ready
        const spectrumModule = await import('./spectrum.js');
        spectrumModule.setupSpectrumCanvasInteraction();

        // Export spectrum module for filter handle color control
        window.spectrumModule = spectrumModule;

        console.log('✅ Inizializzazione completata');
    } catch (e) {
        console.error('❌ Errore durante l\'inizializzazione:', e);
    }

    // Easter egg: press 's' to show logo
    let easterEggLogo = null;
    let easterEggActive = false;

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's' && !easterEggActive) {
            easterEggActive = true;

            // Create logo element if it doesn't exist
            if (!easterEggLogo) {
                easterEggLogo = document.createElement('img');
                easterEggLogo.id = 'easterEggLogo';
                easterEggLogo.src = 'assets/logo.svg';
                easterEggLogo.alt = 'Solar Synth';
                document.body.appendChild(easterEggLogo);
            }

            // Random size between 100px and 500px
            const randomSize = Math.floor(Math.random() * 400) + 100;
            easterEggLogo.style.width = randomSize + 'px';
            easterEggLogo.style.height = randomSize + 'px';

            // Random position (accounting for logo size to keep it on screen)
            const maxX = window.innerWidth - randomSize;
            const maxY = window.innerHeight - randomSize;
            const randomX = Math.max(0, Math.floor(Math.random() * maxX));
            const randomY = Math.max(0, Math.floor(Math.random() * maxY));
            easterEggLogo.style.left = randomX + 'px';
            easterEggLogo.style.top = randomY + 'px';

            // Reset animation by removing and re-adding class
            easterEggLogo.classList.remove('active');
            void easterEggLogo.offsetWidth; // Force reflow
            easterEggLogo.classList.add('active');

            // Reset flag after animation completes
            setTimeout(() => {
                easterEggActive = false;
            }, 1200);
        }
    });
});
