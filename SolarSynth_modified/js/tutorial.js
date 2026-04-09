/**
 * Tutorial System for Solar Synth
 */

class TutorialManager {
    constructor() {
        this.currentSlideIndex = 0;
        this.isOpen = false;
        this.isTyping = false;
        this.typingTimeout = null;
        
        // Tutorial slides data
        this.slides = [
            {
                title: "Welcome to Solar Synth",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
            Welcome to <span style="color: #fbbf24; font-weight: 700;">Solar Synth</span>! This is a real-time data sonification instrument that transforms solar wind data into music. Click NEXT to learn more.
        </p>
        
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px;">
            <img src="assets/tutorial images/solarsynth.png" 
                 alt="Solar Synth Welcome" 
                 style="width: 100%; height: auto; object-fit: contain; border-radius: 6px;">
        </div>
        `,
                buttons: ["NEXT"],
                isHTML: true
            },
            {
                title: "SELECT A PARAMETER",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
            Solar Synth allows you to play real time variables of the solar wind! 
            You can choose between <span style="color: #ef4444; font-weight: 700;">TEMPERATURE</span>, <span style="color: #fbbf24; font-weight: 700;">DENSITY</span> and <span style="color: #34d399; font-weight: 700;">SPEED</span>.
        </p>
        
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px;">
            <img src="assets/tutorial images/slide1tut.svg" 
                 alt="Select Parameter Tutorial" 
                 style="width: 100%; height: auto; max-height: 250px; object-fit: contain; border-radius: 6px;">
        </div>
        `,
                buttons: ["NEXT", "BACK"],
                isHTML: true
            },
            {
                title: "Preview Chart",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
            Your selected parameter is now active on the <span style="color: #fbbf24; font-weight: 700;">Preview Chart</span>. This monitor displays data from the past hour, with a new point appearing every 2-4 minutes.Each dot triggers a musical note: the higher the value, the higher the pitch! A glowing pulse signals the arrival of each new data point. 
        </p>
        
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px;">
            <img src="assets/tutorial images/previewchart.png" 
                 alt="Preview Chart Tutorial" 
                 style="width: 100%; height: auto; max-height: 250px; object-fit: contain; border-radius: 6px;">
        </div>
        `,
                buttons: ["NEXT", "BACK"],
                isHTML: true
            },
            {
                title: "key box",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
                    To create a pleasing output, choose a scale in the <span style="color: #fbbf24; font-weight: 700;">Key Box</span>. The corresponding notes are highlighted in <span style="color: #fb923c; font-weight: 700;">ORANGE</span> on the keyboard. The synth will play only these notes, automatically snapping the parameter value to the nearest one in the scale. You can click individual keys to turn them on or off.
        </p>
        
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px;">
            <img src="assets/tutorial images/keybox.png" 
                 alt="Key Box Tutorial" 
                 style="width: 100%; height: auto; max-height: 250px; object-fit: contain; border-radius: 6px;">
        </div>
        `,
                buttons: ["NEXT", "BACK"],
                isHTML: true
            },
            {
                title: "Mode Box",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
            Select your audio engine in the <span style="color: #fbbf24; font-weight: 700;">Mode Box</span>. Toggle <span style="color: #fb923c; font-weight: 700;">PRESETS</span> to access the onboard library of 7 cosmic samples. Switch to <span style="color: #fb923c; font-weight: 700;">MIDI</span> to transmit note data to your external gear or DAW.
        </p>
        
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px;">
            <img src="assets/tutorial images/mode.png" 
                 alt="Mode Box Tutorial" 
                 style="width: 100%; height: auto; max-height: 250px; object-fit: contain; border-radius: 6px;">
        </div>
        `,
                buttons: ["NEXT", "BACK"],
                isHTML: true
            },
            {
                title: "effects",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
            Shape your tone using the provided <span style="color: #fbbf24; font-weight: 700;">Effects</span> and <span style="color: #fbbf24; font-weight: 700;">Filter</span>. Drag the handles to tune cutoff frequencies and scroll with the mouse wheel to adjust the filter's slope. Click the <span style="color: #3b82f6; font-weight: 700;">dice</span> icon in the effects panel to randomize settings. Double click any knob to reset it to default.
            <br><br>
            <span style="color: #fb923c; font-weight: 700;">Solar Automation</span>: Drag and drop any of the three graphs onto an effect knob. The live solar data will assume control, modulating your sound in real-time! Right click the knob to remove the automation.
            <br><br>
            Finally press the <span style="color: #fb923c; font-weight: 700;">Record Button</span> to capture and save the Sun's performance.
        </p>
        
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px;">
            <img src="assets/tutorial images/effects.png" 
                 alt="Effects Tutorial" 
                 style="width: 100%; height: auto; max-height: 250px; object-fit: contain; border-radius: 6px;">
        </div>
        `,
                buttons: ["NEXT", "BACK"],
                isHTML: true
            },
            {
                title: "THANK YOU!",
                text: `
        <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
            Thanks for trying <span style="color: #fbbf24; font-weight: 700;">Solar Synth</span>, have fun!
        </p>
        
        <p style="font-style: italic; margin-top: 40px; font-size: 14px; color: #94a3b8;">
            - Matteo, Luigi, Paolo, Checco
        </p>
        `,
                buttons: ["CLOSE"],
                isHTML: true
            }
        ];
        
        this.initElements();
        this.attachEventListeners();
    }
    
    initElements() {
        // Ensure tutorial overlay exists
        if (!document.getElementById('tutorialOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'tutorialOverlay';
            overlay.className = 'tutorial-overlay';
            overlay.style.display = 'none';
            overlay.innerHTML = `
                <div class="tutorial-modal">
                    <div class="tutorial-modal-content">
                        <h2 id="tutorialTitle" class="tutorial-title"></h2>
                        <p id="tutorialText" class="tutorial-text"></p>
                        <div class="tutorial-buttons-row">
                            <button id="tutorialQuitBtn" class="tutorial-button tutorial-button-quit">QUIT (ESC)</button>
                            <button id="tutorialPrevBtn" class="tutorial-button tutorial-button-back" style="display:none;">BACK</button>
                            <button id="tutorialNextBtn" class="tutorial-button tutorial-button-next"></button>
                            <button id="tutorialCloseBtn" class="tutorial-button tutorial-button-close" style="display:none;">CLOSE</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        // Ensure info button exists
        if (!document.getElementById('infoBtn')) {
            const infoBtn = document.createElement('button');
            infoBtn.id = 'infoBtn';
            infoBtn.className = 'info-button';
            infoBtn.setAttribute('aria-label', 'Tutorial');
            infoBtn.innerHTML = `<svg viewBox="0 0 40 40" width="28" height="28" style="pointer-events: none;">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#fbbf24" stroke-width="2"/>
                <text x="20" y="27" text-anchor="middle" font-family="Space Mono, monospace" font-size="22" font-weight="700" fill="#fbbf24">i</text>
            </svg>`;
            
            const controls = document.querySelector('.controls');
            if (controls) {
                controls.appendChild(infoBtn);
            }
        }
        
        this.overlay = document.getElementById('tutorialOverlay');
        this.titleEl = document.getElementById('tutorialTitle');
        this.textEl = document.getElementById('tutorialText');
        this.nextBtn = document.getElementById('tutorialNextBtn');
        this.prevBtn = document.getElementById('tutorialPrevBtn');
        this.closeBtn = document.getElementById('tutorialCloseBtn');
        this.quitBtn = document.getElementById('tutorialQuitBtn');
        this.infoBtn = document.getElementById('infoBtn');
        
        // Add the pulse class on startup
        if (this.infoBtn) {
            this.infoBtn.classList.add('tutorial-invite-pulse');
        }
    }
    
    attachEventListeners() {
        // Info button opens tutorial
        this.infoBtn.addEventListener('click', () => {
            // Remove pulse permanently on first click
            this.infoBtn.classList.remove('tutorial-invite-pulse');
            this.open();
        });
        
        // Next button
        this.nextBtn.addEventListener('click', () => this.next());
        
        // Previous button
        this.prevBtn.addEventListener('click', () => this.prev());
        
        // Close button
        this.closeBtn.addEventListener('click', () => this.close());
        
        // Quit button
        this.quitBtn.addEventListener('click', () => this.close());
        
        // Spacebar to advance (only when tutorial is open)
        document.addEventListener('keydown', (e) => {
            if (this.isOpen && e.code === 'Space' && !this.isTyping) {
                e.stopImmediatePropagation();
                e.preventDefault();
                // Check if we're on the last slide
                const isLastSlide = this.currentSlideIndex === this.slides.length - 1;
                if (isLastSlide) {
                    this.close();
                } else {
                    this.next();
                }
            }
            // ESC to quit tutorial
            if (this.isOpen && e.code === 'Escape') {
                e.stopImmediatePropagation();
                e.preventDefault();
                this.close();
            }
        });
        
        // Clicking overlay background closes tutorial
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
    }
    
    open() {
        this.isOpen = true;
        this.currentSlideIndex = 0;
        this.overlay.style.display = 'flex';
        
        // Performance optimization: pause background video
        const bgVideo = document.getElementById('bgVideo');
        if (bgVideo) {
            bgVideo.pause();
        }
        
        // Performance optimization: stop spectrum animation if running
        if (window.spectrumModule && window.spectrumModule.stopSpectrumLoop) {
            window.spectrumModule.stopSpectrumLoop();
        }
        
        this.renderSlide();
    }
    
    close() {
        this.isOpen = false;
        this.overlay.style.display = 'none';
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
        this.isTyping = false;
        
        // Resume background video
        const bgVideo = document.getElementById('bgVideo');
        if (bgVideo) {
            bgVideo.play();
        }
        
        // Resume spectrum animation
        if (window.spectrumModule && window.spectrumModule.startSpectrumLoop) {
            window.spectrumModule.startSpectrumLoop();
        }
    }
    
    next() {
        // If still typing, complete the text immediately
        if (this.isTyping) {
            this.completeTyping();
            return;
        }
        
        // Otherwise, advance to next slide
        if (this.currentSlideIndex < this.slides.length - 1) {
            this.currentSlideIndex++;
            this.renderSlide();
        }
    }
    
    prev() {
        if (this.isTyping) {
            this.completeTyping();
            return;
        }
        
        if (this.currentSlideIndex > 0) {
            this.currentSlideIndex--;
            this.renderSlide();
        }
    }
    
    renderSlide() {
        const slide = this.slides[this.currentSlideIndex];
        
        // Update title
        this.titleEl.textContent = slide.title;
        
        // Check if slide contains HTML content
        const isHTML = slide.isHTML || (slide.text && slide.text.includes('<'));
        
        if (isHTML) {
            // For HTML content, set directly
            this.textEl.innerHTML = slide.text;
        } else {
            // For plain text, display directly
            this.textEl.textContent = slide.text;
        }
        
        this.isTyping = false;
        
        // Update button visibility
        const isLastSlide = this.currentSlideIndex === this.slides.length - 1;
        const isFirstSlide = this.currentSlideIndex === 0;
        
        this.prevBtn.style.display = isFirstSlide ? 'none' : 'block';
        this.closeBtn.style.display = isLastSlide ? 'block' : 'none';
        this.nextBtn.style.display = isLastSlide ? 'none' : 'block';
        
        // Update button text
        if (!isLastSlide) {
            this.nextBtn.textContent = isFirstSlide 
                ? 'NEXT (SPACEBAR)' 
                : 'NEXT (SPACEBAR)';
        } else {
            this.closeBtn.textContent = 'CLOSE (SPACEBAR)';
        }
    }
    
    completeTyping() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
        
        const slide = this.slides[this.currentSlideIndex];
        this.textEl.textContent = slide.text;
        this.isTyping = false;
    }
}

// Initialize tutorial when DOM is ready
export function initTutorial() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.tutorialManager = new TutorialManager();
        });
    } else {
        window.tutorialManager = new TutorialManager();
    }
}

// Export the class for advanced usage
export { TutorialManager };
