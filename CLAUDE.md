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

#### 4. Frequency Band Filtering (RGB Mode Only)
```javascript
async function applyFrequencyFiltering(audioBuffer, lowMidCutoff, midHighCutoff) {
    const offlineCtx = new OfflineAudioContext(3, audioBuffer.length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Low band: Lowpass filter
    const lowFilter = offlineCtx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = lowMidCutoff;

    // Mid band: Bandpass filter
    const midFilter = offlineCtx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = Math.sqrt(lowMidCutoff * midHighCutoff);

    // High band: Highpass filter
    const highFilter = offlineCtx.createBiquadFilter();
    highFilter.type = 'highpass';
    highFilter.frequency.value = midHighCutoff;

    // Connect filters and render
    // Returns: { low, mid, high } - 3 filtered audio channels
}
```

When RGB mode is selected, the entire audio file is pre-filtered into 3 frequency bands using `OfflineAudioContext` and `BiquadFilterNode`:
- **Low band (Red channel)**: Lowpass filter at the low/mid cutoff (default: 250 Hz)
- **Mid band (Green channel)**: Bandpass filter between the two cutoffs (default: 250-4000 Hz)
- **High band (Blue channel)**: Highpass filter at the mid/high cutoff (default: 4000 Hz)

The filtering is performed once at the start of processing using native Web Audio API implementations, which are highly optimized. RMS power is then computed independently for each filtered band at each window position.

**Performance**: Frequency filtering adds approximately 3-4x processing time compared to mono mode, but remains fast enough for interactive use (~3-4 seconds for a 5-minute audio file on modern hardware).

#### 5. Z-Order Curve Mapping
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

#### 6. Color Mapping

**Mono Mode - Viridis Colormap with Dynamic Normalization:**
The Viridis colormap provides perceptually uniform color mapping from low (purple) to high (yellow) power values. The 256-color lookup table is embedded in the HTML.

**Normalization Strategy:**
- After computing all power values, the maximum power level is found
- All power values are normalized: `normalized_power = power / max_power`
- 0 = silence (no power) → purple/dark colors
- 1 = maximum power in the audio file → yellow/bright colors
- **Uses full color range** for better visual contrast and detail
- When reprocessing, temporarily uses previous max power for real-time rendering
- After processing completes, calculates new max power and redraws with correct normalization
- This ensures colors always utilize the full Viridis spectrum regardless of audio loudness

**RGB Mode - Direct Frequency-to-Color Mapping with Per-Band Normalization:**
In RGB mode, the three frequency bands are mapped directly to color channels:
- **Red channel**: Low frequency power (bass)
- **Green channel**: Mid frequency power (mids/vocals)
- **Blue channel**: High frequency power (treble/cymbals)

**Normalization Strategy:**
- After computing all power values, the maximum power for **each band independently** is found
- Each band is normalized by its own max: `normalized = power / max_power_for_band`
- This ensures each frequency band uses its full 0-255 range
- When reprocessing, temporarily uses previous max powers for real-time rendering
- After processing completes, calculates new max powers and redraws with correct normalization
- Independent normalization reveals frequency balance even in imbalanced mixes

This creates intuitive color representations:
- **Red areas**: Bass-heavy sections (kick drums, bass guitar, sub-bass)
- **Green areas**: Mid-frequency dominant (vocals, guitars, snare)
- **Blue areas**: High-frequency emphasis (hi-hats, cymbals, brightness)
- **Yellow (R+G)**: Bass + mids without highs
- **Cyan (G+B)**: Mids + highs without bass
- **Magenta (R+B)**: Bass + highs without mids
- **White (R+G+B)**: Full-spectrum energy
- **Black**: Silence or very low energy

#### 7. Canvas Auto-Sizing
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
   - Range: Any value (positive or negative)
   - Default: 0
   - Shifts the visualization start point along the Z-order curve
   - Specified in beats, converted to samples: `offset_samples = beats * samplesPerBeat`
   - **Instant redraw**: Changes take effect immediately without recomputing power levels
   - Negative values shift backward, positive values shift forward
   - Useful for exploring different visual starting points and alignment

6. **Visualization Mode**:
   - Options: "Mono (Power - Viridis)" or "RGB (Frequency Bands)"
   - Default: Mono
   - **Mono**: Uses Viridis colormap to represent RMS power
   - **RGB**: Maps low/mid/high frequency bands to Red/Green/Blue channels
   - Changing mode requires clicking Process to recompute

7. **Frequency Band Cutoffs** (RGB mode only):
   - **Low/Mid Cutoff (Hz)**:
     - Range: 50-1000 Hz
     - Default: 250 Hz
     - Separates low frequency (bass) from mid frequency
   - **Mid/High Cutoff (Hz)**:
     - Range: 1000-12000 Hz
     - Default: 4000 Hz
     - Separates mid frequency from high frequency (treble)
   - **Band assignments**:
     - Red: 20 Hz to Low/Mid cutoff (bass, kick drums, sub-bass)
     - Green: Low/Mid cutoff to Mid/High cutoff (vocals, guitars, snare)
     - Blue: Mid/High cutoff to 20000 Hz (cymbals, hi-hats, brightness)
   - Changing cutoffs requires clicking Process to recompute

8. **Process Button**:
   - Enabled after audio file is loaded
   - Triggers visualization computation
   - **Must click to apply** changes to BPM, Samples per Beat, Window Size, Visualization Mode, or Filter Cutoffs
   - Shows progress bar during processing (displays "Filtering..." briefly in RGB mode)
   - Z-Order Offset changes do NOT require reprocessing

### Display

- **Canvas**: Shows the visualization with pixel-perfect rendering (`image-rendering: pixelated`)
- **Progress Bar**: Shows percentage completion during processing
- **Info Line**: Displays calculated values:
  - Window interval in milliseconds
  - Canvas size (dimensions)
  - Total number of windows

## Usage Workflow

### Basic Workflow (Mono Mode)
1. Open `index.html` in a modern web browser
2. Click "Choose File" and select an audio file
3. Determine the BPM of your song (use a BPM detection tool if needed)
4. Enter the BPM value
5. Adjust "Samples per Beat" if needed (64 is a good default)
6. Click "Process" and wait for completion
   - Canvas updates in real-time as power levels are computed
   - Progress bar shows current status
7. Examine the visualization for patterns
8. Adjust Z-Order Offset to explore different views
   - Changes apply instantly without reprocessing
   - Try positive and negative values to find optimal alignment
9. To fine-tune BPM or other parameters, adjust them and click "Process" again

### RGB Frequency Visualization Workflow
1. Follow steps 1-5 above
2. Select "RGB (Frequency Bands)" from the Visualization Mode dropdown
3. (Optional) Adjust frequency band cutoffs:
   - Lower the Low/Mid cutoff (e.g., 200 Hz) to capture more bass in red
   - Raise the Mid/High cutoff (e.g., 6000 Hz) to emphasize highs more
   - Default values (250 Hz / 4000 Hz) work well for most music
4. Click "Process" and wait for completion
   - Progress bar shows "Filtering..." during frequency separation
   - Then shows percentage during RMS computation
   - Processing takes ~3-4x longer than mono mode
5. Interpret the color-coded visualization:
   - **Red regions**: Bass-heavy (kick drums, bass lines)
   - **Green regions**: Mid-dominant (vocals, guitars, snare)
   - **Blue regions**: Treble-heavy (hi-hats, cymbals, brightness)
   - **Mixed colors**: Combined frequency content
6. Experiment with different cutoff frequencies for different musical styles:
   - **Electronic/EDM**: Lower cutoffs (200/3000) to emphasize sub-bass
   - **Rock/Metal**: Balanced cutoffs (250/4000) - defaults work well
   - **Classical/Acoustic**: Higher cutoffs (300/5000) to capture nuance

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
- **Supports negative values** to shift backward
- **Instant updates** - no reprocessing required, uses cached power data
- Can reveal different aspects of the rhythmic structure
- Try multiples of 4 or 8 beats to align with musical phrases
- Experiment with fractional values (e.g., -0.5, 2.25) for fine alignment

### Frequency Band Cutoffs (RGB Mode Only)
**Low/Mid Cutoff:**
- **Lower (100-200 Hz)**: Captures deep sub-bass, useful for electronic/EDM
- **Default (250 Hz)**: Good balance for most music, separates bass from mids
- **Higher (300-400 Hz)**: Reduces bass content, emphasizes mid-range

**Mid/High Cutoff:**
- **Lower (2000-3000 Hz)**: Broader mid-range, less emphasis on highs
- **Default (4000 Hz)**: Natural separation between presence and air frequencies
- **Higher (6000-8000 Hz)**: Narrow high band, captures only extreme highs

**Genre-Specific Recommendations:**
- **Electronic/EDM**: 200 Hz / 3000 Hz (emphasize sub-bass and highs)
- **Rock/Pop**: 250 Hz / 4000 Hz (default - balanced)
- **Jazz/Classical**: 300 Hz / 5000 Hz (natural instrumental balance)
- **Hip-Hop**: 180 Hz / 3500 Hz (strong bass presence)
- **Metal**: 200 Hz / 6000 Hz (capture heavy lows and bright highs)

## Algorithm Details

### Processing Pipeline

**Mono Mode:**
1. **Load Audio**
   - Decode audio file to PCM samples
   - Extract mono channel (left channel if stereo)

2. **Calculate Parameters**
   - Window interval from BPM and samples per beat
   - Total number of windows
   - Canvas size (smallest power-of-2 square)

3. **Compute Power Levels and Render in Real-Time**
   - For each window position (single pass):
     - Calculate precise start sample: `Math.round(i * windowIntervalSamples)`
     - Extract window samples
     - Compute RMS power
     - Store in array for caching
     - Apply Z-order offset
     - Convert linear index to (x, y) coordinates via Z-order curve
     - Map power to color using **temporary max power** with Viridis colormap
     - Set pixel in ImageData
     - Every 100 samples: update canvas and progress bar
   - Find maximum power value from all computed powers
   - Redraw canvas with correct normalization (0 to max_power)

4. **Cache Results**
   - Store computed power values
   - Store max power level for normalization
   - Store canvas size, samples per beat, and visualization mode
   - Used for instant redraw when Z-order offset changes

**RGB Mode:**
1. **Load Audio** (same as mono)

2. **Apply Frequency Filtering**
   - Create `OfflineAudioContext` with 3 output channels
   - Create 3 `BiquadFilterNode` instances:
     - Lowpass filter for bass (red channel)
     - Bandpass filter for mids (green channel)
     - Highpass filter for treble (blue channel)
   - Process entire audio file through filters
   - Extract 3 filtered audio buffers (low, mid, high)

3. **Calculate Parameters** (same as mono)

4. **Compute 3-Band Power Levels and Render in Real-Time**
   - For each window position (single pass):
     - Calculate precise start sample: `Math.round(i * windowIntervalSamples)`
     - Compute RMS power on **all 3 filtered bands**
     - Store all 3 power values in separate arrays for caching
     - Apply Z-order offset
     - Convert linear index to (x, y) coordinates via Z-order curve
     - Map (low, mid, high) power to (R, G, B) using **temporary max powers** for each band
     - Set pixel in ImageData
     - Every 100 samples: update canvas and progress bar
   - Find maximum power value for **each band independently**
   - Redraw canvas with correct per-band normalization

5. **Cache Results**
   - Store computed RGB power values (3 arrays: low, mid, high)
   - Store max power levels for each band (low, mid, high)
   - Store canvas size, samples per beat, and visualization mode
   - Used for instant redraw when Z-order offset changes

### Z-Order Offset Instant Redraw

When the Z-order offset is changed after processing:
- Uses cached power values and max power levels (no recomputation)
  - **Mono mode**: Single power array and max power value
  - **RGB mode**: Three power arrays (low, mid, high) and three max power values
- Creates new ImageData with background
- Plots all points with new offset using normalized values:
  - **Mono mode**: Normalize by max power, map to Viridis colormap
  - **RGB mode**: Normalize each band by its max, map to RGB channels
- Renders to canvas immediately
- No progress bar shown (instant operation)

### Performance Considerations

**General:**
- Real-time canvas updates every 100 samples during computation (using previous max values)
- Progress updates synchronized with canvas updates
- Uses `ImageData` for efficient pixel manipulation
- `await` with zero timeout allows UI updates without blocking
- Cached power values enable instant offset changes without reprocessing
- Max power calculation at end of processing is very fast (single pass through arrays)
- Final redraw with correct normalization happens after max power is computed

**Mono Mode Performance:**
- Single RMS calculation per window
- Very fast: ~1 second for 5-minute audio file
- Minimal memory usage

**RGB Mode Performance:**
- Frequency filtering: ~1-2 seconds (native Web Audio API, highly optimized)
- Three RMS calculations per window (3× mono cost)
- Total: ~3-4 seconds for 5-minute audio file
- **~3-4× slower than mono mode** but still very interactive
- Additional memory: 3× power arrays cached
- Much more efficient than per-window FFT (which would be ~10-20× slower)

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
- **Fixed colormap scale (0-1)**: Ensures consistent color meaning across files and during processing

### Key Design Decisions

1. **Manual Process Button**: Changes to BPM, samples per beat, and window size require clicking "Process" to apply. This prevents accidental expensive recomputation while adjusting parameters.

2. **Instant Z-Order Offset Updates**: Offset changes redraw immediately using cached power values and max power levels. This enables rapid exploration of different alignments without reprocessing.

3. **Dynamic Normalization with Stable Reprocessing**:
   - Normalizes to maximum power value(s) found in the audio for full color range utilization
   - **Mono mode**: Single max power value for all pixels
   - **RGB mode**: Independent max power per frequency band (reveals balance even in imbalanced mixes)
   - During reprocessing, uses previous max values for real-time rendering (prevents visualization from disappearing)
   - After processing completes, calculates new max values and redraws for accurate representation
   - Maximizes visual contrast and detail regardless of audio loudness

4. **Real-Time Canvas Updates**: Showing the visualization as it's computed provides immediate feedback and makes the process feel faster, even though computation time is the same.

5. **Cached Power Values and Max Levels**: Storing computed RMS values and max power levels enables instant redraw for offset changes and maintains normalization across reprocessing.

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
   - Z-order offset changes (positive, negative, fractional values)
   - Verify instant redraw performance with large files

2. **Preserve the key invariants**:
   - Precise window positioning (no cumulative error)
   - Power-of-2 samples per beat
   - Correct Z-order coordinate calculation
   - Proper offset conversion (beats → samples)
   - Dynamic normalization to max power values
   - Cached power values and max levels for instant offset redraw
   - Real-time canvas updates during processing (using previous max values)
   - Final redraw after processing with correct normalization

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
**Version**: 1.2
**Author**: Built with Claude Code

## Changelog

### Version 1.2 (2026-01-04)
- **Major Feature**: Added RGB frequency visualization mode
- New Visualization Mode selector: Mono (Power) vs RGB (Frequency Bands)
- Implemented 3-band frequency filtering using Web Audio API:
  - Low band (Red): Lowpass filter for bass frequencies
  - Mid band (Green): Bandpass filter for mid frequencies
  - High band (Blue): Highpass filter for treble frequencies
- Added adjustable frequency band cutoff controls:
  - Low/Mid Cutoff (50-1000 Hz, default 250 Hz)
  - Mid/High Cutoff (1000-12000 Hz, default 4000 Hz)
- Frequency filtering uses `OfflineAudioContext` and `BiquadFilterNode` for performance
- RGB mode caches 3 power arrays for instant Z-order offset redraw
- RGB mode is ~3-4× slower than mono but still interactive (~3-4s for 5-min audio)
- **Dynamic Normalization**: Changed back to normalized max power values for better color utilization
  - Mono mode: Normalizes to single max power value
  - RGB mode: Independent normalization per frequency band (reveals balance)
  - During reprocessing, uses previous max values temporarily (stable rendering)
  - After processing completes, calculates new max and redraws with correct normalization
- Color-coded frequency content visualization:
  - Red areas = bass-heavy, Green = mid-dominant, Blue = treble-heavy
  - Mixed colors reveal frequency content combinations
- Added genre-specific frequency cutoff recommendations in documentation
- Performance is much better than per-window FFT approach (3-4× vs 10-20× slowdown)

### Version 1.1 (2026-01-04) [Superseded by 1.2 normalization changes]
- Added Process button - parameters no longer auto-apply
- Implemented instant Z-order offset redraw using cached power values
- Z-order offset now supports negative values
- Changed to fixed colormap scale (0-1) instead of min/max normalization (reverted in 1.2)
- Added real-time canvas updates during power computation
- Samples per Beat changed to dropdown with powers of 2 (1-512)

### Version 1.0 (2026-01-04)
- Initial release
- Basic audio visualization with Z-order curve mapping
- Viridis colormap
- Adjustable BPM, samples per beat, window size, and Z-order offset
