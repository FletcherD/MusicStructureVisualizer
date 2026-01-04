# WebFFT - Audio Structure Visualizer

## Project Overview

WebFFT is a web application that visualizes the rhythmic structure of audio files by mapping power levels to a 2D space using a Z-order curve (Morton curve). When the window sampling rate is aligned with the song's tempo, rhythmic patterns emerge as visual structures in the visualization.

## Core Concept

The visualization works by:
1. Computing RMS power levels of audio windows at precise tempo-aligned intervals
2. Mapping these 1D time-series values to 2D coordinates using a Z-order space-filling curve
3. Rendering the power levels using the Viridis colormap

The key insight: **When window intervals match the musical tempo, periodic patterns in the music manifest as geometric patterns in 2D space.**

## Technical Implementation

### Files
- `index.html` - Complete single-page application with embedded CSS and JavaScript
- `SPEC.md` - Original specification document
- `CLAUDE.md` - This documentation file

### Architecture

The application is implemented as a single HTML file with inline CSS and JavaScript for simplicity. Key components:

#### 1. Audio Loading (WebAudio API)
- Uses `AudioContext` to decode audio files
- Extracts mono channel data for analysis
- Handles various audio formats supported by the browser

#### 2. Window Positioning (Critical for Accuracy)
```javascript
// Calculate window interval from BPM and samples per beat
const beatsPerSecond = bpm / 60;
const windowsPerSecond = beatsPerSecond * samplesPerBeat;
const windowIntervalSeconds = 1 / windowsPerSecond;
const windowIntervalSamples = windowIntervalSeconds * sampleRate;

// Precise positioning - multiply and round each time to avoid cumulative error
const startSample = Math.round(i * windowIntervalSamples);
```

**Important**: Window positions are calculated using multiplication and rounding for each window, NOT by adding a fixed integer offset. This prevents cumulative error when dealing with non-integer sample spacings.

Example: At 120 BPM with 64 samples/beat at 44100 Hz sample rate:
- Window interval: 7.8125 ms
- Sample spacing: 344.53125 samples
- Position of window N: `Math.round(N * 344.53125)` ✓
- NOT: `N * 345` ✗ (introduces cumulative error)

#### 3. RMS Power Calculation
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

Computes the Root Mean Square (RMS) power of each audio window, which represents the average energy level of the audio in that time window.

#### 4. Z-Order Curve Mapping
```javascript
function getZOrderCoordinates(index, width) {
    let x = 0, y = 0;
    for (let i = 0; i < 16; i++) {
        x |= (index & (1 << (2 * i))) >> i;
        y |= (index & (1 << (2 * i + 1))) >> (i + 1);
    }
    return { x, y };
}
```

The Z-order curve (Morton order) maps a 1D index to 2D coordinates by interleaving the binary digits:
- Even bits → X coordinate
- Odd bits → Y coordinate

This creates a space-filling curve that preserves locality: consecutive 1D indices map to nearby 2D points.

#### 5. Colormap (Viridis)
The Viridis colormap provides perceptually uniform color mapping from low (purple) to high (yellow) power values. The 256-color lookup table is embedded in the HTML.

#### 6. Canvas Auto-Sizing
```javascript
const dimension = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(totalWindows))));
```

Canvas dimensions are automatically calculated as the smallest square power-of-2 that can contain all windows. This ensures efficient Z-order curve mapping.

## User Interface

### Controls

1. **Audio File**: Load any audio file (MP3, WAV, OGG, etc.)

2. **BPM** (Beats Per Minute):
   - Range: 1-300
   - Default: 120
   - **Critical parameter**: Must match the song's actual tempo for patterns to emerge

3. **Samples per Beat**:
   - Dropdown with powers of 2: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512
   - Default: 64
   - **Must be power of 2** for optimal Z-order curve alignment
   - Higher values = more temporal resolution, larger canvas

4. **Window Size** (samples):
   - Range: 128-8192
   - Default: 2048
   - Size of audio window for RMS calculation
   - Larger = smoother but less precise

5. **Z-Order Offset** (beats):
   - Range: 0+
   - Default: 0
   - Shifts the visualization start point along the Z-order curve
   - Specified in beats, converted to samples: `offset_samples = beats * samplesPerBeat`
   - Useful for exploring different visual starting points

6. **Process Button**:
   - Enabled after audio file is loaded
   - Triggers visualization computation
   - Shows progress bar during processing

### Display

- **Canvas**: Shows the visualization with pixel-perfect rendering (`image-rendering: pixelated`)
- **Progress Bar**: Shows percentage completion during processing
- **Info Line**: Displays calculated values:
  - Window interval in milliseconds
  - Canvas size (dimensions)
  - Total number of windows

## Usage Workflow

1. Open `index.html` in a modern web browser
2. Click "Choose File" and select an audio file
3. Determine the BPM of your song (use a BPM detection tool if needed)
4. Enter the BPM value
5. Adjust "Samples per Beat" if needed (64 is a good default)
6. Click "Process" and wait for completion
7. Examine the visualization for patterns
8. Adjust Z-Order Offset to explore different views
9. Fine-tune BPM and other parameters to enhance patterns

## Key Parameters and Their Effects

### BPM (Most Important)
- **Too low**: Patterns will be "stretched" - features appear larger than they should
- **Correct**: Clear, coherent geometric patterns emerge
- **Too high**: Patterns will be "compressed" - features appear smaller/denser

### Samples Per Beat
- **Lower (1-8)**: Coarser temporal resolution, smaller canvas, faster processing
- **Higher (128-512)**: Finer temporal resolution, larger canvas, slower processing
- **Sweet spot**: 32-64 for most music

### Window Size
- **Smaller (<1024)**: More responsive to transients, noisier visualization
- **Larger (>4096)**: Smoother visualization, less detail in fast passages
- **Sweet spot**: 2048 samples at 44.1kHz ≈ 46ms window

### Z-Order Offset
- Used to shift the "starting position" in the visualization
- Measured in beats for intuitive control
- Can reveal different aspects of the rhythmic structure
- Try multiples of 4 or 8 beats to align with musical phrases

## Algorithm Details

### Processing Pipeline

1. **Load Audio**
   - Decode audio file to PCM samples
   - Extract mono channel (left channel if stereo)

2. **Calculate Parameters**
   - Window interval from BPM and samples per beat
   - Total number of windows
   - Canvas size (smallest power-of-2 square)

3. **Compute Power Levels** (with progress updates)
   - For each window position:
     - Calculate precise start sample: `Math.round(i * windowIntervalSamples)`
     - Extract window samples
     - Compute RMS power
     - Store in array

4. **Normalize Power Values**
   - Find min and max power across all windows
   - Used for colormap scaling

5. **Render to Canvas**
   - For each power value:
     - Apply Z-order offset
     - Convert linear index to (x, y) coordinates via Z-order curve
     - Map power to color using Viridis colormap
     - Set pixel in ImageData
   - Write ImageData to canvas

### Performance Considerations

- Progress updates every 100 windows during power calculation
- Single render pass after all calculations complete
- Uses `ImageData` for efficient pixel manipulation
- `await` with zero timeout allows UI updates without blocking

## Mathematical Foundation

### Window Interval Calculation

Given:
- BPM = beats per minute
- S = samples per beat
- R = audio sample rate (Hz)

Calculate:
```
beats_per_second = BPM / 60
windows_per_second = beats_per_second × S
window_interval_seconds = 1 / windows_per_second
window_interval_samples = window_interval_seconds × R
```

Example (BPM=120, S=64, R=44100):
```
beats_per_second = 120 / 60 = 2
windows_per_second = 2 × 64 = 128
window_interval_seconds = 1 / 128 = 0.0078125 s = 7.8125 ms
window_interval_samples = 0.0078125 × 44100 = 344.53125 samples
```

### Z-Order Curve Properties

The Z-order curve has several important properties:
1. **Locality preservation**: Nearby 1D indices → nearby 2D points
2. **Hierarchical structure**: Forms a recursive pattern at all scales
3. **Efficient indexing**: O(1) conversion between 1D and 2D
4. **Power-of-2 friendly**: Works best with power-of-2 dimensions

For musical visualization, the Z-order curve causes periodic patterns in the 1D signal to form geometric patterns in 2D space. The exact patterns depend on:
- The period of repetition (beat length)
- The samples per beat setting
- The Z-order offset

## Troubleshooting

### No Patterns Visible
- **Check BPM**: Use a BPM detection tool to verify the song's tempo
- **Try different offsets**: Use Z-Order Offset to find the "right" starting point
- **Increase samples per beat**: Try 128 or 256 for more detail
- **Check audio file**: Ensure it's not corrupted or too short

### Patterns Look Wrong
- **Fine-tune BPM**: Try ±0.1-1 BPM adjustments
- **Check time signature**: Complex time signatures may need special handling
- **Variable tempo**: Songs with tempo changes won't work well

### Performance Issues
- **Reduce samples per beat**: Try 32 or 16 instead of 64
- **Shorter audio files**: Trim to 2-3 minutes for testing
- **Close other tabs**: Free up browser memory

### Canvas Too Large/Small
- This is automatic based on audio length and parameters
- Reduce samples per beat for smaller canvas
- Increase samples per beat for larger canvas

## Future Enhancement Ideas

### Potential Features
- [ ] Stereo visualization (two canvases or color channels)
- [ ] Real-time playback with position indicator
- [ ] Automatic BPM detection
- [ ] Frequency band separation (bass/mid/treble)
- [ ] Different space-filling curves (Hilbert, Peano)
- [ ] Export to PNG/SVG
- [ ] Zoom and pan controls
- [ ] Multiple colormap options
- [ ] Beat detection and alignment
- [ ] Animation showing time progression

### Alternative Analysis Methods
- Spectral power (FFT) instead of RMS
- Peak detection
- Onset detection
- Harmonic analysis
- Rhythm pattern recognition

## Technical Requirements

### Browser Support
- Modern browsers with WebAudio API support:
  - Chrome 35+
  - Firefox 25+
  - Safari 14.1+
  - Edge 79+
- Canvas 2D API support (all modern browsers)
- ES6 JavaScript support

### Audio Format Support
Depends on browser, but typically:
- MP3 (all browsers)
- WAV (all browsers)
- OGG Vorbis (Chrome, Firefox)
- AAC/M4A (Safari, Chrome, Edge)
- FLAC (Chrome, Firefox, Edge)

## Code Style and Conventions

- Single-file application for easy distribution
- Inline styles and scripts
- ES6+ JavaScript syntax
- camelCase for JavaScript variables and functions
- Descriptive variable names
- Comments at function level and for complex logic
- Progress feedback for long-running operations
- Error handling for file loading

## Development Notes

### Why Single File?
- Easy to distribute and use
- No build process required
- No dependencies or package management
- Works offline once downloaded
- Simple to understand and modify

### Why These Defaults?
- **120 BPM**: Common tempo for many genres
- **64 samples/beat**: Good balance of resolution and canvas size
- **2048 window size**: ~46ms at 44.1kHz, good for rhythm analysis
- **Viridis colormap**: Perceptually uniform and colorblind-friendly

### Known Limitations
- Mono only (uses left channel for stereo files)
- Cannot handle tempo changes within a song
- Memory usage grows with file length and samples per beat
- No Web Workers (runs on main thread)
- No audio playback integration

## References

### Z-Order Curve (Morton Order)
- Also called: Morton curve, Morton code, Z-curve
- Used in: Spatial indexing, image processing, database systems
- Properties: Space-filling, locality-preserving, hierarchical

### Viridis Colormap
- Developed for matplotlib
- Perceptually uniform
- Colorblind-friendly
- Monotonically increasing luminance

### WebAudio API
- Modern browser API for audio processing
- Low-latency audio manipulation
- Supports various audio formats
- Can access raw PCM data

## Maintenance

When updating this project:

1. **Always test with**:
   - Multiple BPM values (slow: 60-80, medium: 100-140, fast: 160-200)
   - Different audio formats
   - Various file lengths (30s, 2min, 5min+)
   - Different samples per beat settings

2. **Preserve the key invariants**:
   - Precise window positioning (no cumulative error)
   - Power-of-2 samples per beat
   - Correct Z-order coordinate calculation
   - Proper offset conversion (beats → samples)

3. **Performance considerations**:
   - Keep progress updates frequent enough for feedback
   - Avoid unnecessary DOM updates during calculation
   - Test with large files (10+ minutes)

4. **Update this document** when:
   - Adding new features
   - Changing parameters or algorithms
   - Discovering new usage patterns
   - Finding optimal parameter combinations for specific genres

---

**Last Updated**: 2026-01-04
**Version**: 1.0
**Author**: Built with Claude Code
