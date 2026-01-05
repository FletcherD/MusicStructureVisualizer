// Main Application Controller
// Manages UI state, event handlers, and audio processing workflow

import { getZOrderCoordinates } from './z-order.js';
import { calculateRMSPower, applyFrequencyFiltering } from './audio-processor.js';
import { powerToColor, redrawCanvas } from './visualizer.js';
import {
    playbackState, startPlayback, pausePlayback, updateMarker, formatTime,
    setupOverlayCanvas, getCanvasPositionForTime, getTimeForCanvasClick
} from './playback.js';

// Application state
const state = {
    audioContext: null,
    audioBuffer: null,
    isProcessing: false,

    // Cached computation results for quick redraw
    cachedPowers: null,        // Mono mode: single power array
    cachedRGBPowers: null,     // RGB mode: {low, mid, high} arrays
    cachedCanvasSize: 0,
    cachedSamplesPerBeat: 0,
    cachedVizMode: 'mono',

    // Max power levels for normalization
    maxPowerMono: 1.0,
    maxPowerRGB: { low: 1.0, mid: 1.0, high: 1.0 }
};

// DOM elements
let canvas, ctx, progressContainer, progressFill, calculatedInfo;
let audioFileInput, bpmInput, samplesPerBeatInput, windowSizeInput, zOrderOffsetInput;
let vizModeInput, filterControlsGroup, lowMidCutoffInput, midHighCutoffInput, processButton;
let playbackControls, playPauseButton, seekSlider, currentTimeDisplay, totalTimeDisplay, markerOverlay;

/**
 * Initialize the application
 */
export function init() {
    // Get DOM elements
    canvas = document.getElementById('visualizer');
    ctx = canvas.getContext('2d');
    progressContainer = document.getElementById('progressContainer');
    progressFill = document.getElementById('progressFill');
    calculatedInfo = document.getElementById('calculatedInfo');

    // Input elements
    audioFileInput = document.getElementById('audioFile');
    bpmInput = document.getElementById('bpm');
    samplesPerBeatInput = document.getElementById('samplesPerBeat');
    windowSizeInput = document.getElementById('windowSize');
    zOrderOffsetInput = document.getElementById('zOrderOffset');
    vizModeInput = document.getElementById('vizMode');
    filterControlsGroup = document.getElementById('filterControlsGroup');
    lowMidCutoffInput = document.getElementById('lowMidCutoff');
    midHighCutoffInput = document.getElementById('midHighCutoff');
    processButton = document.getElementById('processButton');

    // Playback control elements
    playbackControls = document.getElementById('playbackControls');
    playPauseButton = document.getElementById('playPauseButton');
    seekSlider = document.getElementById('seekSlider');
    currentTimeDisplay = document.getElementById('currentTime');
    totalTimeDisplay = document.getElementById('totalTime');
    markerOverlay = document.getElementById('markerOverlay');

    // Setup event listeners
    setupEventListeners();

    // Make canvas clickable
    canvas.style.cursor = 'pointer';
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Audio file loading
    audioFileInput.addEventListener('change', handleAudioFileChange);

    // Process button
    processButton.addEventListener('click', handleProcessClick);

    // Z-order offset - instant redraw
    zOrderOffsetInput.addEventListener('input', handleZOrderOffsetChange);

    // Visualization mode change
    vizModeInput.addEventListener('change', handleVizModeChange);

    // Filter cutoff displays
    lowMidCutoffInput.addEventListener('input', updateFilterDisplays);
    midHighCutoffInput.addEventListener('input', updateFilterDisplays);

    // Playback controls
    playPauseButton.addEventListener('click', handlePlayPauseClick);
    seekSlider.addEventListener('input', handleSeekChange);
    canvas.addEventListener('click', handleCanvasClick);

    // Window resize
    window.addEventListener('resize', handleWindowResize);
}

/**
 * Handle audio file selection
 */
async function handleAudioFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        processButton.disabled = false;
    } catch (error) {
        console.error('Error loading audio:', error);
        alert('Error loading audio file. Please try another file.');
    }
}

/**
 * Handle process button click
 */
function handleProcessClick() {
    if (state.audioBuffer && !state.isProcessing) {
        // Pause playback when reprocessing
        if (playbackState.isPlaying) {
            pausePlayback({
                audioContext: state.audioContext,
                playPauseButton: playPauseButton
            });
        }
        playbackState.currentPlaybackTime = 0;
        processAudio();
    }
}

/**
 * Handle Z-order offset change - instant redraw
 */
function handleZOrderOffsetChange() {
    if ((state.cachedPowers || state.cachedRGBPowers) && !state.isProcessing) {
        const zOrderOffsetBeats = parseFloat(zOrderOffsetInput.value);
        const zOrderOffset = Math.round(zOrderOffsetBeats * state.cachedSamplesPerBeat);
        redrawCanvas(state, canvas, zOrderOffset);

        if (state.audioBuffer) {
            updateMarkerWrapper();
        }
    }
}

/**
 * Handle visualization mode change
 */
function handleVizModeChange() {
    const isRGB = vizModeInput.value === 'rgb';
    filterControlsGroup.style.display = isRGB ? 'block' : 'none';
}

/**
 * Update filter cutoff displays
 */
function updateFilterDisplays() {
    const lowMid = lowMidCutoffInput.value;
    const midHigh = midHighCutoffInput.value;
    document.getElementById('lowMidDisplay').textContent = lowMid;
    document.getElementById('lowMidDisplay2').textContent = lowMid;
    document.getElementById('midHighDisplay').textContent = midHigh;
    document.getElementById('midHighDisplay2').textContent = midHigh;
}

/**
 * Handle play/pause button click
 */
function handlePlayPauseClick() {
    if (!state.audioBuffer || (!state.cachedPowers && !state.cachedRGBPowers)) return;

    if (playbackState.isPlaying) {
        pausePlayback({
            audioContext: state.audioContext,
            playPauseButton: playPauseButton
        });
    } else {
        startPlayback(playbackState.currentPlaybackTime, {
            audioBuffer: state.audioBuffer,
            audioContext: state.audioContext,
            playPauseButton: playPauseButton,
            onUpdateMarker: updateMarkerWrapper
        });
    }
}

/**
 * Handle seek slider change
 */
function handleSeekChange(e) {
    if (!state.audioBuffer) return;

    const time = (parseFloat(e.target.value) / 100) * state.audioBuffer.duration;
    playbackState.currentPlaybackTime = time;

    if (playbackState.isPlaying) {
        startPlayback(time, {
            audioBuffer: state.audioBuffer,
            audioContext: state.audioContext,
            playPauseButton: playPauseButton,
            onUpdateMarker: updateMarkerWrapper
        });
    } else {
        updateMarkerWrapper();
    }
}

/**
 * Handle canvas click - seek to clicked position
 */
function handleCanvasClick(e) {
    if (!state.audioBuffer || (!state.cachedPowers && !state.cachedRGBPowers)) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const zOrderOffsetBeats = parseFloat(zOrderOffsetInput.value);
    const zOrderOffset = Math.round(zOrderOffsetBeats * state.cachedSamplesPerBeat);

    const time = getTimeForCanvasClick(canvasX, canvasY, {
        bpm: parseFloat(bpmInput.value),
        sampleRate: state.audioBuffer.sampleRate,
        cachedSamplesPerBeat: state.cachedSamplesPerBeat,
        zOrderOffset: zOrderOffset,
        audioDuration: state.audioBuffer.duration
    });

    if (time !== null) {
        playbackState.currentPlaybackTime = time;
        startPlayback(time, {
            audioBuffer: state.audioBuffer,
            audioContext: state.audioContext,
            playPauseButton: playPauseButton,
            onUpdateMarker: updateMarkerWrapper
        });
    }
}

/**
 * Handle window resize
 */
function handleWindowResize() {
    if (state.cachedCanvasSize && playbackControls.style.display === 'block') {
        setupOverlayCanvas(canvas, markerOverlay);
        updateMarkerWrapper();
    }
}

/**
 * Wrapper for updateMarker with proper parameters
 */
function updateMarkerWrapper() {
    const zOrderOffsetBeats = parseFloat(zOrderOffsetInput.value);
    const zOrderOffset = Math.round(zOrderOffsetBeats * state.cachedSamplesPerBeat);

    const time = updateMarker({
        audioBuffer: state.audioBuffer,
        audioContext: state.audioContext,
        canvas: canvas,
        markerOverlay: markerOverlay,
        cachedCanvasSize: state.cachedCanvasSize,
        seekSlider: seekSlider,
        onGetPosition: (t) => getCanvasPositionForTime(t, {
            bpm: parseFloat(bpmInput.value),
            sampleRate: state.audioBuffer.sampleRate,
            cachedSamplesPerBeat: state.cachedSamplesPerBeat,
            cachedCanvasSize: state.cachedCanvasSize,
            zOrderOffset: zOrderOffset,
            audioBuffer: state.audioBuffer
        }),
        onPausePlayback: () => pausePlayback({
            audioContext: state.audioContext,
            playPauseButton: playPauseButton
        })
    });

    // Update time display
    if (time !== undefined) {
        currentTimeDisplay.textContent = formatTime(time);
        totalTimeDisplay.textContent = formatTime(state.audioBuffer.duration);
    }

    // Continue animation loop if playing
    if (playbackState.isPlaying) {
        playbackState.animationFrameId = requestAnimationFrame(updateMarkerWrapper);
    }
}

/**
 * Main audio processing function
 */
async function processAudio() {
    if (state.isProcessing || !state.audioBuffer) return;

    state.isProcessing = true;
    canvas.style.display = '';
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressFill.textContent = '0%';

    const bpm = parseFloat(bpmInput.value);
    const samplesPerBeat = parseInt(samplesPerBeatInput.value);
    const windowSize = parseInt(windowSizeInput.value);
    const zOrderOffsetBeats = parseFloat(zOrderOffsetInput.value);
    const zOrderOffset = Math.round(zOrderOffsetBeats * samplesPerBeat);
    const vizMode = vizModeInput.value;

    const sampleRate = state.audioBuffer.sampleRate;

    // Apply frequency filtering if in RGB mode
    let audioData, filteredBands;
    if (vizMode === 'rgb') {
        const lowMidCutoff = parseFloat(lowMidCutoffInput.value);
        const midHighCutoff = parseFloat(midHighCutoffInput.value);

        progressFill.textContent = 'Filtering...';
        filteredBands = await applyFrequencyFiltering(state.audioBuffer, lowMidCutoff, midHighCutoff);
        progressFill.textContent = '0%';
    } else {
        // Get mono audio data
        audioData = state.audioBuffer.getChannelData(0);
    }

    // Calculate window interval
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * samplesPerBeat;
    const windowIntervalSeconds = 1 / windowsPerSecond;
    const windowIntervalSamples = windowIntervalSeconds * sampleRate;

    // Calculate number of windows
    const audioLength = vizMode === 'rgb' ? filteredBands.low.length : audioData.length;
    const totalWindows = Math.floor(audioLength / windowIntervalSamples);

    // Calculate canvas dimensions
    const dimension = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(totalWindows))));
    const canvasSize = dimension;

    // Update info
    calculatedInfo.textContent = `Window interval: ${(windowIntervalSeconds * 1000).toFixed(4)} ms | Canvas size: ${canvasSize}x${canvasSize} | Total windows: ${totalWindows}`;

    // Setup canvas
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    canvas.style.width = `${Math.min(800, canvasSize)}px`;
    canvas.style.height = `${Math.min(800, canvasSize)}px`;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const imageData = ctx.createImageData(canvasSize, canvasSize);

    if (vizMode === 'mono') {
        await processMonoMode(audioData, totalWindows, windowIntervalSamples, windowSize,
                              zOrderOffset, canvasSize, imageData);
    } else {
        await processRGBMode(filteredBands, totalWindows, windowIntervalSamples, windowSize,
                            zOrderOffset, canvasSize, imageData);
    }

    progressFill.style.width = '100%';
    progressFill.textContent = '100%';

    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 1000);

    state.isProcessing = false;

    // Show playback controls after first successful process
    playbackControls.style.display = 'block';
    setupOverlayCanvas(canvas, markerOverlay);
    playbackState.currentPlaybackTime = 0;
    updateMarkerWrapper();
}

/**
 * Process audio in mono mode
 */
async function processMonoMode(audioData, totalWindows, windowIntervalSamples, windowSize,
                               zOrderOffset, canvasSize, imageData) {
    const powers = [];
    const minPower = 0;
    const tempMaxPower = state.maxPowerMono;

    for (let i = 0; i < totalWindows; i++) {
        const startSample = Math.round(i * windowIntervalSamples);
        const power = calculateRMSPower(audioData, startSample, windowSize);
        powers.push(power);

        // Plot using Z-order curve with Viridis colormap
        const index = i + zOrderOffset;
        const { x, y } = getZOrderCoordinates(index, canvasSize);

        if (x < canvasSize && y < canvasSize) {
            const color = powerToColor(power, minPower, tempMaxPower);
            const pixelIndex = (y * canvasSize + x) * 4;
            imageData.data[pixelIndex] = color[0];
            imageData.data[pixelIndex + 1] = color[1];
            imageData.data[pixelIndex + 2] = color[2];
            imageData.data[pixelIndex + 3] = color[3];
        }

        // Update canvas and progress every 1000 samples
        if (i % 1000 === 0) {
            ctx.putImageData(imageData, 0, 0);
            const progress = (i / totalWindows) * 100;
            progressFill.style.width = `${progress}%`;
            progressFill.textContent = `${Math.round(progress)}%`;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }

    // Calculate actual max power
    state.maxPowerMono = Math.max(...powers);
    if (state.maxPowerMono === 0) state.maxPowerMono = 1.0;

    // Cache for instant redraw
    state.cachedPowers = powers;
    state.cachedRGBPowers = null;
    state.cachedCanvasSize = canvasSize;
    state.cachedSamplesPerBeat = parseInt(samplesPerBeatInput.value);
    state.cachedVizMode = 'mono';

    // Redraw with correct normalization
    redrawCanvas(state, canvas, zOrderOffset);
}

/**
 * Process audio in RGB mode
 */
async function processRGBMode(filteredBands, totalWindows, windowIntervalSamples, windowSize,
                              zOrderOffset, canvasSize, imageData) {
    const lowPowers = [];
    const midPowers = [];
    const highPowers = [];
    const tempMaxRGB = { ...state.maxPowerRGB };

    for (let i = 0; i < totalWindows; i++) {
        const startSample = Math.round(i * windowIntervalSamples);

        // Compute RMS for each frequency band
        const lowPower = calculateRMSPower(filteredBands.low, startSample, windowSize);
        const midPower = calculateRMSPower(filteredBands.mid, startSample, windowSize);
        const highPower = calculateRMSPower(filteredBands.high, startSample, windowSize);

        lowPowers.push(lowPower);
        midPowers.push(midPower);
        highPowers.push(highPower);

        // Plot using Z-order curve with RGB mapping
        const index = i + zOrderOffset;
        const { x, y } = getZOrderCoordinates(index, canvasSize);

        if (x < canvasSize && y < canvasSize) {
            const pixelIndex = (y * canvasSize + x) * 4;
            const normalizedLow = Math.min(1, lowPower / tempMaxRGB.low);
            const normalizedMid = Math.min(1, midPower / tempMaxRGB.mid);
            const normalizedHigh = Math.min(1, highPower / tempMaxRGB.high);

            imageData.data[pixelIndex] = Math.floor(normalizedLow * 255);
            imageData.data[pixelIndex + 1] = Math.floor(normalizedMid * 255);
            imageData.data[pixelIndex + 2] = Math.floor(normalizedHigh * 255);
            imageData.data[pixelIndex + 3] = 255;
        }

        // Update canvas and progress every 1000 samples
        if (i % 1000 === 0) {
            ctx.putImageData(imageData, 0, 0);
            const progress = (i / totalWindows) * 100;
            progressFill.style.width = `${progress}%`;
            progressFill.textContent = `${Math.round(progress)}%`;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }

    // Calculate actual max power for each band
    state.maxPowerRGB.low = Math.max(...lowPowers);
    state.maxPowerRGB.mid = Math.max(...midPowers);
    state.maxPowerRGB.high = Math.max(...highPowers);

    if (state.maxPowerRGB.low === 0) state.maxPowerRGB.low = 1.0;
    if (state.maxPowerRGB.mid === 0) state.maxPowerRGB.mid = 1.0;
    if (state.maxPowerRGB.high === 0) state.maxPowerRGB.high = 1.0;

    // Cache for instant redraw
    state.cachedRGBPowers = { low: lowPowers, mid: midPowers, high: highPowers };
    state.cachedPowers = null;
    state.cachedCanvasSize = canvasSize;
    state.cachedSamplesPerBeat = parseInt(samplesPerBeatInput.value);
    state.cachedVizMode = 'rgb';

    // Redraw with correct normalization
    redrawCanvas(state, canvas, zOrderOffset);
}
