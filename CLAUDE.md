# WebFFT - Audio Structure Visualizer

## Project Overview

WebFFT is a web application that visualizes the rhythmic and frequency structure of audio files by mapping audio characteristics to a 2D space using a Z-order curve (Morton curve). When the window sampling rate is aligned with the song's tempo, rhythmic patterns emerge as visual structures in the visualization.

The application offers two visualization modes:
- **Mono Mode**: Maps RMS power levels to colors using the Viridis colormap
- **RGB Mode**: Maps frequency band power (low/mid/high) to RGB color channels for frequency-domain visualization

## Core Concept

The visualization works by:
1. Computing RMS power levels of audio windows at precise tempo-aligned intervals
2. **Mono Mode**: Rendering power using the Viridis colormap, OR **RGB Mode**: Computing power in 3 frequency bands and mapping to RGB
3. Mapping these 1D time-series values to 2D coordinates using a Z-order space-filling curve

The key insight: **When window intervals match the musical tempo, periodic patterns in the music manifest as geometric patterns in 2D space. In RGB mode, frequency content is revealed through color.**

## File Structure

The application is written in TypeScript and built with esbuild into a single bundled JavaScript file:

```
WebFFT/
├── index.html              # HTML structure + bundled script
├── styles.css              # All CSS styling
├── package.json            # npm dependencies and build scripts
├── tsconfig.json           # TypeScript configuration
├── .gitignore             # Git ignore patterns
├── SPEC.md                # Original specification document
├── CLAUDE.md              # This documentation file
├── src/                   # TypeScript source files
│   ├── types.ts               # Shared type definitions
│   ├── constants.ts           # Viridis colormap data
│   ├── z-order.ts             # Z-order curve utilities
│   ├── audio-processor.ts     # RMS calculation + frequency filtering
│   ├── visualizer.ts          # Canvas rendering and color mapping
│   ├── playback.ts            # Audio playback control and time tracking
│   └── ui-controller.ts       # Main application logic and event handlers
└── dist/                  # Build output (generated)
    ├── app.js                 # Bundled JavaScript (14KB minified)
    └── app.js.map             # Source maps for debugging
```

## Development Setup

### Prerequisites
- Node.js (v14 or later)
- npm or yarn

### Installation
```bash
npm install
```

### Development Workflow
```bash
# Development mode with watch (rebuilds on file changes)
npm run dev

# Production build (minified)
npm run build

# Start local web server
npm run serve
# Then open http://localhost:8000
```

### Build Output
- **Minified bundle**: 14.3 KB (all code in single file)
- **Source maps**: Included for debugging TypeScript in browser
- **No CORS issues**: Works with file:// protocol or local server

### Module Responsibilities

**types.ts**
- Shared TypeScript interfaces and types
- `AppState`: Application state structure
- `PlaybackState`: Playback state structure
- `RGBPowers`, `FilteredBands`: Audio data structures
- `Coordinates`, `PositionParams`, etc.: Function parameter types

**constants.ts**
- Exports the 256-color Viridis colormap lookup table
- Typed as `RGBColor[]` for type safety
- Provides perceptually uniform, colorblind-friendly color data

**z-order.ts**
- `interleave(x: number, y: number): number`: Convert 2D coordinates to Z-order index
- `getZOrderCoordinates(index: number, width: number): Coordinates`: Convert linear index to 2D coordinates
- Implements Morton curve space-filling algorithm

**audio-processor.ts**
- `calculateRMSPower(audioData: Float32Array, startSample: number, windowSize: number): number`: Compute RMS power
- `applyFrequencyFiltering(audioBuffer: AudioBuffer, lowMidCutoff: number, midHighCutoff: number): Promise<FilteredBands>`: Split audio into 3 frequency bands
- Uses Web Audio API filters, returns typed filtered audio data

**visualizer.ts**
- `powerToColor(power: number, minPower: number, maxPower: number): RGBAColor`: Map power value to Viridis color
- `redrawCanvas(state: AppState, canvas: HTMLCanvasElement, zOrderOffset: number): void`: Redraw visualization
- Handles both mono (Viridis) and RGB (frequency band) rendering modes

**playback.ts**
- Manages playback state (source node, timing, animation frame)
- `getCanvasPositionForTime(time: number, params: PositionParams): Coordinates | null`: Map audio time to canvas coordinates
- `getTimeForCanvasClick(canvasX: number, canvasY: number, params: TimeParams): number | null`: Reverse mapping
- `startPlayback(fromTime: number, params: PlaybackParams): Promise<void>`: Start/resume audio playback
- `pausePlayback(params: PauseParams): void`: Pause audio playback
- `updateMarker(params: MarkerParams): number`: Update visual marker position (~60 FPS)
- `formatTime(seconds: number): string`: Format time as MM:SS
- `setupOverlayCanvas(canvas: HTMLCanvasElement, markerOverlay: HTMLCanvasElement): void`: Position overlay canvas

**ui-controller.ts**
- Main application entry point (`init()` function, auto-called on DOM ready)
- Manages typed application state (audio buffer, cached powers, max power values)
- Event handlers for all UI interactions with proper types
- `processAudio(): Promise<void>`: Main processing pipeline
- `processMonoMode(...)`: Mono visualization processing
- `processRGBMode(...)`: RGB frequency visualization processing
- `handleZOrderOffsetInputChange()`: Syncs number input changes to slider
- `handleZOrderOffsetSliderChange()`: Syncs slider changes to number input
- `updateVisualizationWithOffset()`: Performs instant redraw with new offset

## Technical Implementation

### 1. Audio Loading (WebAudio API)
- Uses `AudioContext` to decode audio files
- Extracts mono channel data for analysis (left channel if stereo)
- Handles various audio formats supported by the browser (MP3, WAV, OGG, etc.)

### 2. Window Positioning (Critical for Accuracy)
Window positions are calculated using multiplication and rounding for each window, NOT by adding a fixed integer offset. This prevents cumulative error when dealing with non-integer sample spacings.

```javascript
// Calculate window interval from BPM and samples per beat
const beatsPerSecond = bpm / 60;
const windowsPerSecond = beatsPerSecond * samplesPerBeat;
const windowIntervalSeconds = 1 / windowsPerSecond;
const windowIntervalSamples = windowIntervalSeconds * sampleRate;

// Precise positioning - multiply and round each time
const startSample = Math.round(i * windowIntervalSamples);
```

Example: At 120 BPM with 64 samples/beat at 44100 Hz sample rate:
- Window interval: 7.8125 ms
- Sample spacing: 344.53125 samples
- Position of window N: `Math.round(N * 344.53125)` ✓
- NOT: `N * 345` ✗ (introduces cumulative error)

### 3. RMS Power Calculation
Computes the Root Mean Square (RMS) power of each audio window, which represents the average energy level of the audio in that time window.

```javascript
function calculateRMSPower(audioData, startSample, windowSize) {
    let sum = 0;
    const endSample = Math.min(startSample + windowSize, audioData.length);
    const actualWindowSize = endSample - startSample;

    for (let i = startSample; i < endSample; i++) {
        sum += audioData[i] * audioData[i];
    }

    return Math.sqrt(sum / actualWindowSize);
}
```

### 4. Frequency Band Filtering (RGB Mode Only)
When RGB mode is selected, the entire audio file is pre-filtered into 3 frequency bands using `OfflineAudioContext` and `BiquadFilterNode`:
- **Low band (Red channel)**: Lowpass filter at the low/mid cutoff (default: 250 Hz)
- **Mid band (Green channel)**: Bandpass filter between the two cutoffs (default: 250-4000 Hz, Q = geometric mean)
- **High band (Blue channel)**: Highpass filter at the mid/high cutoff (default: 4000 Hz)

The filtering is performed once at the start of processing using native Web Audio API implementations, which are highly optimized. RMS power is then computed independently for each filtered band at each window position.

**Performance**: Frequency filtering adds approximately 3-4x processing time compared to mono mode, but remains fast enough for interactive use (~3-4 seconds for a 5-minute audio file on modern hardware).

### 5. Z-Order Curve Mapping
The Z-order curve (Morton order) maps a 1D index to 2D coordinates by interleaving the binary digits:
- Even bits → X coordinate
- Odd bits → Y coordinate

This creates a space-filling curve that preserves locality: consecutive 1D indices map to nearby 2D points, causing periodic patterns in audio to manifest as geometric patterns in 2D space.

### 6. Color Mapping

**Mono Mode - Viridis Colormap with Dynamic Normalization:**
- After computing all power values, the maximum power level is found
- All power values are normalized: `normalized_power = power / max_power`
- 0 = silence → purple/dark colors, 1 = maximum power → yellow/bright colors
- When reprocessing, temporarily uses previous max power for real-time rendering
- After processing completes, calculates new max power and redraws with correct normalization

**RGB Mode - Direct Frequency-to-Color Mapping with Per-Band Normalization:**
- Red channel: Low frequency power (bass)
- Green channel: Mid frequency power (mids/vocals)
- Blue channel: High frequency power (treble/cymbals)
- Each band is normalized independently by its own max power
- This ensures each frequency band uses its full 0-255 range

Color interpretation in RGB mode:
- **Red**: Bass-heavy (kick drums, bass guitar, sub-bass)
- **Green**: Mid-dominant (vocals, guitars, snare)
- **Blue**: Treble-heavy (hi-hats, cymbals, brightness)
- **Yellow (R+G)**: Bass + mids without highs
- **Cyan (G+B)**: Mids + highs without bass
- **Magenta (R+B)**: Bass + highs without mids
- **White (R+G+B)**: Full-spectrum energy
- **Black**: Silence or very low energy

### 7. Canvas Auto-Sizing
Canvas dimensions are automatically calculated as the smallest square power-of-2 that can contain all windows:

```javascript
const dimension = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(totalWindows))));
```

This ensures efficient Z-order curve mapping and clean visualization boundaries.

### 8. Audio Playback and Synchronization
The application includes synchronized audio playback with real-time visual tracking using an overlay canvas architecture.

**Playback System:**
- Uses `AudioBufferSourceNode` with existing WebAudio API infrastructure
- Provides precise timing via `audioContext.currentTime`
- Sources can only be used once, so a new source is created for each play/seek operation
- Handles browser autoplay policy by resuming suspended AudioContext

**Visual Marker:**
- Semi-transparent yellow circular highlight overlaid on the visualization
- Separate overlay canvas positioned absolutely over main canvas
- Updates at ~60 FPS via `requestAnimationFrame` during playback
- Color: `rgba(255, 255, 100, 0.4)` fill with `0.8` opacity stroke

**Time ↔ Position Mapping:**
- Forward: Time → Window Index → Z-order coordinates → Canvas position
- Reverse: Canvas click → Z-order index → Window index → Time
- Uses `interleave()` function for O(1) reverse mapping

**Synchronization Strategy:**
- Animation loop runs continuously during playback via `requestAnimationFrame`
- Current time calculated: `playbackStartOffset + (audioContext.currentTime - playbackStartTime)`
- Marker position, seek slider, and time display updated each frame
- Automatically pauses when playback reaches end of audio

**Performance:**
- Overlay canvas avoids redrawing entire visualization (~1M pixels → ~200 operations per frame)
- Real-time updates have no impact on visualization processing performance

## User Interface Controls

### Audio Processing Controls

1. **Audio File**: Load any audio file (MP3, WAV, OGG, etc.)

2. **BPM** (Beats Per Minute):
   - Range: 1-300, default: 120
   - **Critical parameter**: Must match the song's actual tempo for patterns to emerge

3. **Samples per Beat**:
   - Dropdown: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 (default: 64)
   - **Must be power of 2** for optimal Z-order curve alignment
   - Higher values = more temporal resolution, larger canvas

4. **Window Size** (samples):
   - Range: 128-8192, default: 2048
   - Size of audio window for RMS calculation
   - Larger = smoother but less precise

5. **Z-Order Offset** (beats):
   - **Number Input**: Any value (positive or negative), default: 0
   - **Slider**: Range -4 to +4 beats with 0.01 step precision (high precision adjustment)
   - Both controls are synchronized - changing one updates the other
   - Number input can accept values outside slider range for extreme offsets
   - Shifts visualization start point along Z-order curve
   - **Instant redraw** - no reprocessing required, uses cached power data
   - Useful for exploring different visual starting points

6. **Visualization Mode**:
   - Options: "Mono (Power - Viridis)" or "RGB (Frequency Bands)"
   - Default: Mono
   - Changing mode requires clicking Process to recompute

7. **Frequency Band Cutoffs** (RGB mode only):
   - **Low/Mid Cutoff**: 50-1000 Hz (default: 250 Hz) - separates bass from mids
   - **Mid/High Cutoff**: 1000-12000 Hz (default: 4000 Hz) - separates mids from treble
   - Changing cutoffs requires clicking Process to recompute

8. **Process Button**:
   - Triggers visualization computation
   - Shows progress bar during processing
   - **Automatically pauses playback** when clicked

### Playback Controls

Appear after first successful processing:

- **Play/Pause Button**: Start or pause audio playback, resumes from current position
- **Seek Slider**: Scrub through audio timeline, updates in real-time during playback
- **Time Display**: Shows current time and total duration (MM:SS format)
- **Canvas Click to Seek**: Click anywhere on visualization to jump to that position and start playback

## Usage Workflow

### Basic Mono Mode Workflow
1. Open `index.html` in a modern web browser
2. Click "Choose File" and select an audio file
3. Determine the BPM of your song (use a BPM detection tool if needed)
4. Enter the BPM value
5. Adjust "Samples per Beat" if needed (64 is a good default)
6. Click "Process" and wait for completion
7. Use playback controls to listen and see synchronized visualization
8. Adjust Z-Order Offset to explore different views (instant update)
9. Click on visualization to seek to specific positions

### RGB Frequency Visualization Workflow
1. Follow steps 1-5 above
2. Select "RGB (Frequency Bands)" from Visualization Mode dropdown
3. (Optional) Adjust frequency band cutoffs for specific musical styles
4. Click "Process" and wait for completion (~3-4× longer than mono mode)
5. Interpret color-coded visualization:
   - Red = bass, Green = mids, Blue = treble
   - Mixed colors = combined frequency content
6. Experiment with different cutoff frequencies for different genres

## Key Parameters and Their Effects

### BPM (Most Important)
- **Too low**: Patterns "stretched" - features appear larger
- **Correct**: Clear, coherent geometric patterns emerge
- **Too high**: Patterns "compressed" - features appear smaller/denser

### Samples Per Beat
- **Lower (1-8)**: Coarser resolution, smaller canvas, faster processing
- **Higher (128-512)**: Finer resolution, larger canvas, slower processing
- **Sweet spot**: 32-64 for most music

### Window Size
- **Smaller (<1024)**: More responsive to transients, noisier
- **Larger (>4096)**: Smoother, less detail in fast passages
- **Sweet spot**: 2048 samples at 44.1kHz ≈ 46ms window

### Z-Order Offset
- Shifts "starting position" in visualization (measured in beats)
- **Instant updates** - no reprocessing required
- **Dual control system**:
  - Number input: For precise values or extreme offsets outside slider range
  - Slider (-4 to +4 beats): For quick, smooth exploration with 0.01 precision
- Try multiples of 4 or 8 beats to align with musical phrases
- Supports negative values to shift backward

### Frequency Band Cutoffs (RGB Mode)
Genre-specific recommendations:
- **Electronic/EDM**: 200 Hz / 3000 Hz (emphasize sub-bass and highs)
- **Rock/Pop**: 250 Hz / 4000 Hz (balanced - default)
- **Jazz/Classical**: 300 Hz / 5000 Hz (natural instrumental balance)
- **Hip-Hop**: 180 Hz / 3500 Hz (strong bass presence)
- **Metal**: 200 Hz / 6000 Hz (heavy lows and bright highs)

## Processing Pipeline

### Mono Mode
1. Load audio and decode to PCM samples
2. Calculate parameters (window interval, canvas size)
3. Compute RMS power for each window:
   - Calculate precise start sample position
   - Compute RMS power
   - Store in cache array
   - Apply Z-order offset and map to canvas coordinates
   - Render pixel using temporary max power
   - Update canvas every 1000 samples
4. Find maximum power from all computed values
5. Redraw canvas with correct normalization (0 to max_power)

### RGB Mode
1. Load audio and decode to PCM samples
2. Apply frequency filtering to create 3 bands (low, mid, high)
3. Calculate parameters (window interval, canvas size)
4. Compute RMS power for each window on all 3 bands:
   - Calculate precise start sample position
   - Compute RMS power for low, mid, and high bands
   - Store in cache arrays (3 separate arrays)
   - Apply Z-order offset and map to canvas coordinates
   - Render pixel using temporary max powers per band
   - Update canvas every 1000 samples
5. Find maximum power for each band independently
6. Redraw canvas with correct per-band normalization

### Z-Order Offset Instant Redraw
When offset changes after processing:
- Uses cached power values and max power levels (no recomputation)
- Creates new ImageData and plots all points with new offset
- Renders immediately (no progress bar needed)

## Technical Requirements

### Browser Support
Modern browsers with WebAudio API support:
- Chrome 61+ (recommended)
- Firefox 60+
- Safari 11+
- Edge 79+

**Note**: The bundled JavaScript works in all modern browsers. No ES6 module support required since code is bundled into a single file.

### Audio Format Support
Depends on browser, typically:
- MP3 (all browsers)
- WAV (all browsers)
- OGG Vorbis (Chrome, Firefox)
- AAC/M4A (Safari, Chrome, Edge)
- FLAC (Chrome, Firefox, Edge)

## Development Notes

### Why TypeScript + esbuild?

**Type Safety Benefits:**
- Compile-time error checking prevents runtime bugs
- IDE autocomplete and inline documentation
- Refactoring with confidence (rename, move functions safely)
- Clear contracts between modules via interfaces
- Null/undefined safety catches audio data edge cases

**Build Benefits:**
- **Single file output**: 14.3 KB minified, no CORS issues
- **Fast builds**: esbuild compiles in milliseconds (~4ms)
- **Source maps**: Debug TypeScript directly in browser
- **Works everywhere**: Bundled code runs in any modern browser
- **Simple tooling**: One config file, three npm scripts

**Developer Experience:**
- Watch mode for instant feedback during development
- Type errors shown in editor before build
- No need for local web server during development (bundle works with file://)
- Easy to onboard new developers (types document the code)

### Module Dependencies
- `types.ts`: No dependencies (pure type definitions)
- `constants.ts`: Imports `types.ts` for type annotations
- `z-order.ts`: Imports `types.ts` for return types
- `audio-processor.ts`: Imports `types.ts` for typed parameters and returns
- `visualizer.ts`: Imports `constants.ts`, `z-order.ts`, `types.ts`
- `playback.ts`: Imports `z-order.ts`, `types.ts`
- `ui-controller.ts`: Imports all other modules (main orchestrator)

### Key Design Decisions

1. **Manual Process Button**: Prevents accidental expensive recomputation while adjusting parameters

2. **Instant Z-Order Offset Updates**: Enables rapid exploration using cached power data

3. **Dynamic Normalization with Stable Reprocessing**:
   - Mono: Single max power for all pixels
   - RGB: Independent max power per band
   - During reprocessing: uses previous max for real-time rendering
   - After completion: calculates new max and redraws

4. **Real-Time Canvas Updates**: Every 1000 samples during computation for immediate feedback

5. **Cached Power Values**: Enables instant redraw for offset changes and maintains normalization

6. **Overlay Canvas Architecture**: Marker rendering doesn't require redrawing entire visualization

## Known Limitations
- Mono only (uses left channel for stereo files)
- Cannot handle tempo changes within a song
- Memory usage grows with file length and samples per beat
- Processing runs on main thread (no Web Workers)

## References

### Z-Order Curve (Morton Order)
- Space-filling, locality-preserving, hierarchical
- Used in spatial indexing, image processing, database systems

### Viridis Colormap
- Developed for matplotlib
- Perceptually uniform, colorblind-friendly
- Monotonically increasing luminance

### WebAudio API
- Modern browser API for audio processing
- Low-latency audio manipulation
- Supports various audio formats and raw PCM data access

---

**Last Updated**: 2026-01-04
**Version**: 3.1 (Added Z-order offset slider)
**Author**: Built with Claude Code
