# Audio Structure Visualizer

[Use it on github.io]](https://fletcherd.github.io/MusicStructureVisualizer/)

WebFFT creates visual representations of audio files by mapping sound characteristics onto a 2D canvas using a Z-order space-filling curve. When the window sampling rate aligns with the song's tempo, periodic patterns in the music manifest as geometric patterns in the visualization.

**Quick Instructions**
- Click "Choose file" to load a file from your system. For best results use a track that's composed 'on the grid'; for example, a lot of electronic music.
- Click "Process".
- Click anywhere on the visualization to start playing from that point. An indicator tracks the play position on the visualization.
- To improve results, move the "Offset" slider until the yellow dot jumps on the music's '1'.

## Visualization Modes

**RGB Mode (Default)**
- Maps frequency band power to color channels
- Red: Low frequencies (bass, kick drums)
- Green: Mid frequencies (vocals, guitars, snare)
- Blue: High frequencies (hi-hats, cymbals)
- Mixed colors indicate combined frequency content

**Mono Mode**
- Maps overall RMS power to a perceptually uniform colormap (Viridis)
- Purple indicates low power, yellow indicates high power

## Usage

1. Open `index.html` in a modern web browser
2. Load an audio file (MP3, WAV, OGG, etc.)
3. Click "Detect BPM" to automatically detect tempo and beat offset
4. Click "Process" to generate the visualization
5. Use playback controls to listen with synchronized visual tracking

## Controls

### Audio Processing

**BPM (Beats Per Minute)**
- Should match the song's actual tempo
- Use "Detect BPM" for automatic detection
- The most critical parameter for pattern emergence

**Samples per Beat**
- Number of windows per beat (must be power of 2)
- Higher values = more temporal resolution, larger canvas
- Default: 256

**Offset**
- Shifts the visualization start point (in seconds)
- Automatically set by BPM detection
- Adjustable via number input or slider for exploration
- Changes apply instantly using cached data (no reprocessing)

**Window Size**
- Size of audio window for RMS calculation (in samples)
- Larger windows = smoother output, less temporal precision
- Default: 512

**Visualization Mode**
- Choose RGB (frequency bands) or Mono (power levels)
- RGB processing takes approximately 3-4x longer than Mono

**Frequency Band Cutoffs** (RGB mode only)
- Low/Mid cutoff: Separates bass from mids (default: 250 Hz)
- Mid/High cutoff: Separates mids from treble (default: 4000 Hz)
- Adjust based on genre characteristics if desired

### Playback

**Play/Pause**
- Controls audio playback with synchronized visual marker

**Seek Slider**
- Scrub through the audio timeline

**Canvas Click**
- Click any position on the visualization to seek and play from that point

**Time Display**
- Shows current position and total duration

## Technical Details

### Z-Order Curve Mapping
The visualization uses a Morton curve to map 1D time-series data to 2D coordinates. Consecutive audio windows map to nearby canvas pixels, causing repetitive musical structures to appear as geometric patterns when BPM alignment is correct.

### Color Normalization
- **Mono mode**: All power values normalized to the global maximum
- **RGB mode**: Each frequency band normalized independently to its own maximum

This ensures full use of the color range regardless of audio characteristics.

### Canvas Sizing
Canvas dimensions are automatically calculated to use the minimal rectangular size that can contain all windows on the Z-order curve. The calculation distributes bits between width and height, with any extra bit assigned to width.

### Processing Performance
All audio processing occurs in the browser. No data is uploaded. RGB mode applies frequency filtering using Web Audio API biquad filters, which adds processing time but remains interactive on modern hardware.

## Supported Formats

- MP3, WAV (all browsers)
- OGG Vorbis (Chrome, Firefox)
- AAC/M4A (Safari, Chrome, Edge)
- FLAC (Chrome, Firefox, Edge)

## Browser Requirements

- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 79+

Requires Web Audio API support.

## Notes

- Only the left channel is analyzed for stereo files
- Songs with tempo changes are not well-suited for this visualization method
- Pattern clarity depends on accurate BPM matching and rhythmic consistency
- Memory usage scales with file length and samples per beat setting
