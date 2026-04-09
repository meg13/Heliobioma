# Solar Synth
### Realtime Solar Wind Sonification Interface

**Solar Synth** is an interactive web application that transforms solar wind data (speed, density, and temperature) provided by NOAA into real-time music. The project combines scientific data visualization with sound synthesis, allowing the user to "listen" to the behavior of our star.

**Live Demo:** https://paolo361.github.io/SolarSynth/


## Quick Start

1.  **Start:** Click the **PLAY** button (flashing green) in the top left corner.
2.  **Audio:** The system will start an automatic *fade-in* to protect hearing.
3.  **Listen:** The arpeggiator will play notes based on data from the selected chart (by a click).


## User Manual

### 0. StepByStep-Tutorial
* click the i-icone next to dB bar in the synth's page

### 1. Main Controls (Top Bar)
* **PLAY / PAUSE:** Starts or stops playback and chart scrolling.
* **RESET:** Returns the time cursor to the beginning and stops the sound.
* **METRONOME:** Activates a synchronized rhythmic click.
* **REC (o):** Records the output audio. Press again to download the `.wav` file.
* **dB:** Increase or decrease dB to adjust the volume.

### 2. Speed Management (BPM)
The **Speed** knob controls the data reading speed.
* **Adjustment:** Click and drag the knob up/down.
* **Quick Reset:** **Double-click** the knob to return to **120 BPM**.
* **Manual Input:** **Double-click** the BPM text (e.g., "120 BPM") to type a specific value.

### 3. Sound Mode
* **PRESETS:** Uses internal samples (e.g., *Halo, Photon*).
* **MIDI:** Disables internal audio and sends MIDI signals to external synthesizers.

### 4. Effects Panel
Each effect (Delay, Reverb, Chorus, Distortion) has an activation button and several knobs.
* **ON / OFF:** Activates the effect. **Note:** If the effect is OFF, changes to the knobs will not be audible until it is activated.
* **Reset Parameters:** **Double-click** on any knob to reset it to **0**.

### 5. Equalizer (EQ) and Spectrum
The black graph in the bottom right shows audio frequencies.
* **High-Pass Filter (HP):** Drag the **left** vertical line to cut bass frequencies.
* **Low-Pass Filter (LP):** Drag the **right** vertical line to cut treble frequencies.
* **Band-Pass Filter (BP):** Customize frequencies to cut (HP+LP).
* **nb:** Scroll the mouse wheel to increase the slope of the line starting from the cutoff frequency.

### 6. Drag and Drop
* Drag one of the charts (Temperature, Density, Velocity) onto controls (knobs or EQ) to automate effects based on the data.
* nb: right click to remove automation

## Technologies Used
* **HTML5 / CSS3** (Flexbox & Responsive Design)
* **JavaScript (ES6+)**
* **Tone.js** (Audio Engine)
* **Chart.js** (Data Visualization)
* **NOAA API** (Realtime Data)


## Development
To run the project locally:
1.  Clone the repository.
2.  Open the folder with VS Code.
3.  Use the **Live Server** extension to launch `index.html`.
