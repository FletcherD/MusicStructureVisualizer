// Main Application Controller for UI v2
// Manages UI state, event handlers, and audio processing workflow

import * as BeatDetector from 'web-audio-beat-detector';
import { getZOrderCoordinates } from './z-order.js';
import { calculateRMSPower, applyFrequencyFiltering } from './audio-processor.js';
import { powerToColor, redrawCanvas } from './visualizer.js';
import {
    playbackState, startPlayback, pausePlayback, updateMarker, formatTime,
    setupOverlayCanvas, getCanvasPositionForTime, getTimeForCanvasClick
} from './playback.js';
import type { AppState, FilteredBands } from './types.js';

// Application state
const state: AppState = {
    audioContext: null,
    audioBuffer: null,
    isProcessing: false,
    cachedPowers: null,
    cachedRGBPowers: null,
    cachedCanvasWidth: 0,
    cachedCanvasHeight: 0,
    cachedSamplesPerBeat: 0,
    cachedVizMode: 'mono',
    maxPowerMono: 1.0,
    maxPowerRGB: { low: 1.0, mid: 1.0, high: 1.0 }
};

// DOM elements
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let progressContainer: HTMLElement;
let progressFill: HTMLElement;
let progressText: HTMLElement;
let calculatedInfo: HTMLElement;
let emptyState: HTMLElement;
let canvasContainer: HTMLElement;

let audioFileInput: HTMLInputElement;
let fileDropZone: HTMLElement;
let fileInfo: HTMLElement;
let fileName: HTMLElement;
let fileDuration: HTMLElement;
let changeFileBtn: HTMLButtonElement;
let bpmInput: HTMLInputElement;
let detectBpmButton: HTMLButtonElement;
let samplesPerBeatInput: HTMLSelectElement;
let windowSizeInput: HTMLSelectElement;
let zOrderOffsetInput: HTMLInputElement;
let zOrderOffsetSlider: HTMLInputElement;
let modeRgbInput: HTMLInputElement;
let modeMonoInput: HTMLInputElement;
let frequencyCutoffs: HTMLElement;
let lowMidCutoffInput: HTMLInputElement;
let midHighCutoffInput: HTMLInputElement;
let processButton: HTMLButtonElement;

let floatingControls: HTMLElement;
let playPauseButton: HTMLButtonElement;
let playIcon: SVGElement;
let pauseIcon: SVGElement;
let seekSlider: HTMLInputElement;
let currentTimeDisplay: HTMLElement;
let totalTimeDisplay: HTMLElement;
let markerOverlay: HTMLCanvasElement;

// Modal elements
let helpModal: HTMLElement;
let helpIcon: HTMLButtonElement;
let closeModal: HTMLButtonElement;
let closeModalButton: HTMLButtonElement;

/**
 * Initialize the application
 */
export function init(): void {
    // Get DOM elements
    canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    ctx = canvas.getContext('2d')!;
    progressContainer = document.getElementById('progressContainer')!;
    progressFill = document.getElementById('progressFill')!;
    progressText = document.getElementById('progressText')!;
    calculatedInfo = document.getElementById('calculatedInfo')!;
    emptyState = document.getElementById('emptyState')!;
    canvasContainer = document.getElementById('canvasContainer')!;

    // Input elements
    audioFileInput = document.getElementById('audioFile') as HTMLInputElement;
    fileDropZone = document.getElementById('fileDropZone')!;
    fileInfo = document.getElementById('fileInfo')!;
    fileName = document.getElementById('fileName')!;
    fileDuration = document.getElementById('fileDuration')!;
    changeFileBtn = document.getElementById('changeFileBtn') as HTMLButtonElement;
    bpmInput = document.getElementById('bpm') as HTMLInputElement;
    detectBpmButton = document.getElementById('detectBpm') as HTMLButtonElement;
    samplesPerBeatInput = document.getElementById('samplesPerBeat') as HTMLSelectElement;
    windowSizeInput = document.getElementById('windowSize') as HTMLSelectElement;
    zOrderOffsetInput = document.getElementById('zOrderOffset') as HTMLInputElement;
    zOrderOffsetSlider = document.getElementById('zOrderOffsetSlider') as HTMLInputElement;
    modeRgbInput = document.getElementById('modeRgb') as HTMLInputElement;
    modeMonoInput = document.getElementById('modeMono') as HTMLInputElement;
    frequencyCutoffs = document.getElementById('frequencyCutoffs')!;
    lowMidCutoffInput = document.getElementById('lowMidCutoff') as HTMLInputElement;
    midHighCutoffInput = document.getElementById('midHighCutoff') as HTMLInputElement;
    processButton = document.getElementById('processButton') as HTMLButtonElement;

    // Clear file input on page load to ensure it reflects actual state
    audioFileInput.value = '';

    // Playback control elements
    floatingControls = document.getElementById('floatingControls')!;
    playPauseButton = document.getElementById('playPauseButton') as HTMLButtonElement;
    playIcon = playPauseButton.querySelector('.play-icon') as SVGElement;
    pauseIcon = playPauseButton.querySelector('.pause-icon') as SVGElement;
    seekSlider = document.getElementById('seekSlider') as HTMLInputElement;
    currentTimeDisplay = document.getElementById('currentTime')!;
    totalTimeDisplay = document.getElementById('totalTime')!;
    markerOverlay = document.getElementById('markerOverlay') as HTMLCanvasElement;

    // Override play/pause button updates to use icons instead of text
    setupPlayPauseButtonObserver();

    // Modal elements
    helpModal = document.getElementById('helpModal')!;
    helpIcon = document.getElementById('helpIcon') as HTMLButtonElement;
    closeModal = document.getElementById('closeModal') as HTMLButtonElement;
    closeModalButton = document.getElementById('closeModalButton') as HTMLButtonElement;

    // Setup event listeners
    setupEventListeners();

    // Make canvas clickable
    canvas.style.cursor = 'pointer';

    // Show help modal on first load
    showHelpModal();
}

/**
 * Setup play/pause button observer to handle icon changes
 */
function setupPlayPauseButtonObserver(): void {
    const observer = new MutationObserver(() => {
        const text = playPauseButton.textContent?.trim() || '';
        if (text.includes('▶') || text === '▶') {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            // Clear text content but keep the icons
            if (playPauseButton.childNodes.length > 2) {
                Array.from(playPauseButton.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        node.remove();
                    }
                });
            }
        } else if (text.includes('⏸') || text === '⏸') {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            // Clear text content but keep the icons
            if (playPauseButton.childNodes.length > 2) {
                Array.from(playPauseButton.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        node.remove();
                    }
                });
            }
        }
    });

    observer.observe(playPauseButton, {
        childList: true,
        characterData: true,
        subtree: true
    });
}

/**
 * Setup all event listeners
 */
function setupEventListeners(): void {
    // File input
    audioFileInput.addEventListener('change', handleAudioFileChange);
    changeFileBtn.addEventListener('click', handleChangeFile);

    // File drop zone
    fileDropZone.addEventListener('click', () => audioFileInput.click());
    fileDropZone.addEventListener('dragover', handleDragOver);
    fileDropZone.addEventListener('dragleave', handleDragLeave);
    fileDropZone.addEventListener('drop', handleDrop);

    // Controls
    detectBpmButton.addEventListener('click', handleDetectBpmClick);
    processButton.addEventListener('click', handleProcessClick);
    zOrderOffsetInput.addEventListener('input', handleZOrderOffsetInputChange);
    zOrderOffsetSlider.addEventListener('input', handleZOrderOffsetSliderChange);
    modeRgbInput.addEventListener('change', handleModeChange);
    modeMonoInput.addEventListener('change', handleModeChange);
    lowMidCutoffInput.addEventListener('input', updateFilterDisplays);
    midHighCutoffInput.addEventListener('input', updateFilterDisplays);

    // Playback
    playPauseButton.addEventListener('click', handlePlayPauseClick);
    seekSlider.addEventListener('input', handleSeekChange);
    canvas.addEventListener('click', handleCanvasClick);
    window.addEventListener('resize', handleWindowResize);

    // Modal event listeners
    helpIcon.addEventListener('click', showHelpModal);
    closeModal.addEventListener('click', hideHelpModal);
    closeModalButton.addEventListener('click', hideHelpModal);
    helpModal.addEventListener('click', (e) => {
        // Close if clicking outside the modal content
        if (e.target === helpModal) {
            hideHelpModal();
        }
    });
}

/**
 * Handle change file button click
 */
function handleChangeFile(): void {
    // Reset file info display
    fileInfo.style.display = 'none';
    fileDropZone.style.display = 'block';
    audioFileInput.value = '';

    // Clear audio state
    state.audioBuffer = null;
    state.cachedPowers = null;
    state.cachedRGBPowers = null;
    floatingControls.style.display = 'none';
    canvasContainer.style.display = 'none';
    emptyState.style.display = 'flex';

    // Disable controls
    processButton.disabled = true;
    detectBpmButton.disabled = true;
    playPauseButton.disabled = true;

    // Reset info badges
    const badges = calculatedInfo.querySelectorAll('.info-badge');
    badges[0].textContent = 'Window: —';
    badges[1].textContent = 'Canvas: —';
}

/**
 * Handle drag over event
 */
function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    fileDropZone.classList.add('drag-over');
}

/**
 * Handle drag leave event
 */
function handleDragLeave(): void {
    fileDropZone.classList.remove('drag-over');
}

/**
 * Handle drop event
 */
function handleDrop(e: DragEvent): void {
    e.preventDefault();
    fileDropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        audioFileInput.files = e.dataTransfer.files;
        handleAudioFileChange(new Event('change'));
    }
}

/**
 * Handle audio file selection
 */
async function handleAudioFileChange(e: Event): Promise<void> {
    const file = audioFileInput.files?.[0];
    if (!file) return;

    // Immediately disable all controls
    processButton.disabled = true;
    detectBpmButton.disabled = true;
    if (playbackState.isPlaying && state.audioContext) {
        pausePlayback({
            audioContext: state.audioContext,
            playPauseButton: playPauseButton
        });
    }
    playPauseButton.disabled = true;

    // Update file info display
    fileName.textContent = file.name;
    fileDropZone.style.display = 'none';
    fileInfo.style.display = 'block';

    // Show loading in info badges
    const badges = calculatedInfo.querySelectorAll('.info-badge');
    badges[0].textContent = 'Loading...';
    badges[1].textContent = '';

    // Clear previous data
    state.audioBuffer = null;
    state.cachedPowers = null;
    state.cachedRGBPowers = null;
    floatingControls.style.display = 'none';
    emptyState.style.display = 'flex';
    canvasContainer.style.display = 'none';

    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        // Update file duration
        fileDuration.textContent = formatTime(state.audioBuffer.duration);

        // Re-enable controls
        processButton.disabled = false;
        detectBpmButton.disabled = false;

        // Reset info display
        badges[0].textContent = 'Window: —';
        badges[1].textContent = 'Canvas: —';

        // Automatically detect BPM
        await handleDetectBpmClick();
    } catch (error) {
        console.error('Error loading audio:', error);
        alert('Error loading audio file. Please try another file.');

        // Reset UI on error
        badges[0].textContent = 'Error loading file';
        badges[1].textContent = '';
        processButton.disabled = true;
        detectBpmButton.disabled = true;
        fileDropZone.style.display = 'block';
        fileInfo.style.display = 'none';
    }
}

/**
 * Handle detect BPM button click
 */
async function handleDetectBpmClick(): Promise<void> {
    if (!state.audioBuffer) return;

    detectBpmButton.disabled = true;
    const originalText = detectBpmButton.innerHTML;
    detectBpmButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="12" cy="5" r="1"></circle>
            <circle cx="12" cy="19" r="1"></circle>
        </svg>
        Detecting...
    `;

    try {
        const { bpm, offset, tempo } = await BeatDetector.guess(state.audioBuffer);

        // Update BPM input
        bpmInput.value = tempo.toFixed(1);

        // Update z-order offset input (offset is in seconds from the library)
        zOrderOffsetInput.value = (-offset).toFixed(3);

        // Update slider if value is within range
        if (offset >= -2 && offset <= 2) {
            zOrderOffsetSlider.value = (-offset).toFixed(3);
        }

        detectBpmButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ${Math.round(bpm)} BPM
        `;

        // Re-enable after 2 seconds
        setTimeout(() => {
            detectBpmButton.innerHTML = originalText;
            detectBpmButton.disabled = false;
        }, 2000);

        // Automatically start processing
        await processAudio();
    } catch (error) {
        console.error('Error detecting BPM:', error);
        alert('Error detecting BPM. Please try manually entering the BPM.');
        detectBpmButton.innerHTML = originalText;
        detectBpmButton.disabled = false;
    }
}

/**
 * Handle process button click
 */
function handleProcessClick(): void {
    if (state.audioBuffer && !state.isProcessing) {
        if (playbackState.isPlaying) {
            pausePlayback({
                audioContext: state.audioContext!,
                playPauseButton: playPauseButton
            });
        }
        playbackState.currentPlaybackTime = 0;
        processAudio();
    }
}

/**
 * Handle Z-order offset number input change - update slider and redraw
 */
function handleZOrderOffsetInputChange(): void {
    const value = parseFloat(zOrderOffsetInput.value);
    // Update slider if value is within slider range
    if (value >= -2 && value <= 2) {
        zOrderOffsetSlider.value = value.toString();
    }
    updateVisualizationWithOffset();
}

/**
 * Handle Z-order offset slider change - update number input and redraw
 */
function handleZOrderOffsetSliderChange(): void {
    const value = parseFloat(zOrderOffsetSlider.value);
    zOrderOffsetInput.value = value.toFixed(3);
    updateVisualizationWithOffset();
}

/**
 * Update visualization with current Z-order offset - instant redraw
 */
function updateVisualizationWithOffset(): void {
    if ((state.cachedPowers || state.cachedRGBPowers) && !state.isProcessing) {
        const zOrderOffsetSeconds = parseFloat(zOrderOffsetInput.value);
        const bpm = parseFloat(bpmInput.value);
        const beatsPerSecond = bpm / 60;
        const windowsPerSecond = beatsPerSecond * state.cachedSamplesPerBeat;
        const zOrderOffset = Math.round(zOrderOffsetSeconds * windowsPerSecond);
        redrawCanvas(state, canvas, zOrderOffset);

        if (state.audioBuffer) {
            updateMarkerWrapper();
        }
    }
}

/**
 * Handle visualization mode change
 */
function handleModeChange(): void {
    const isRGB = modeRgbInput.checked;
    frequencyCutoffs.style.display = isRGB ? 'block' : 'none';
}

/**
 * Update filter cutoff displays
 */
function updateFilterDisplays(): void {
    const lowMid = lowMidCutoffInput.value;
    const midHigh = midHighCutoffInput.value;
    document.getElementById('lowMidDisplay')!.textContent = lowMid;
    document.getElementById('lowMidDisplay2')!.textContent = lowMid;
    document.getElementById('midHighDisplay')!.textContent = midHigh;
    document.getElementById('midHighDisplay2')!.textContent = midHigh;
}

/**
 * Handle play/pause button click
 */
function handlePlayPauseClick(): void {
    if (!state.audioBuffer || (!state.cachedPowers && !state.cachedRGBPowers)) return;

    if (playbackState.isPlaying) {
        pausePlayback({
            audioContext: state.audioContext!,
            playPauseButton: playPauseButton
        });
    } else {
        startPlayback(playbackState.currentPlaybackTime, {
            audioBuffer: state.audioBuffer,
            audioContext: state.audioContext!,
            playPauseButton: playPauseButton,
            onUpdateMarker: updateMarkerWrapper
        });
    }
}

/**
 * Handle seek slider change
 */
function handleSeekChange(e: Event): void {
    if (!state.audioBuffer) return;

    const target = e.target as HTMLInputElement;
    const time = (parseFloat(target.value) / 100) * state.audioBuffer.duration;
    playbackState.currentPlaybackTime = time;

    if (playbackState.isPlaying) {
        startPlayback(time, {
            audioBuffer: state.audioBuffer,
            audioContext: state.audioContext!,
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
function handleCanvasClick(e: MouseEvent): void {
    if (!state.audioBuffer || (!state.cachedPowers && !state.cachedRGBPowers)) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const zOrderOffsetSeconds = parseFloat(zOrderOffsetInput.value);
    const bpm = parseFloat(bpmInput.value);
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * state.cachedSamplesPerBeat;
    const zOrderOffset = Math.round(zOrderOffsetSeconds * windowsPerSecond);

    const time = getTimeForCanvasClick(canvasX, canvasY, {
        bpm: bpm,
        sampleRate: state.audioBuffer.sampleRate,
        cachedSamplesPerBeat: state.cachedSamplesPerBeat,
        zOrderOffset: zOrderOffset,
        audioDuration: state.audioBuffer.duration
    });

    if (time !== null) {
        playbackState.currentPlaybackTime = time;
        startPlayback(time, {
            audioBuffer: state.audioBuffer,
            audioContext: state.audioContext!,
            playPauseButton: playPauseButton,
            onUpdateMarker: updateMarkerWrapper
        });
    }
}

/**
 * Handle window resize
 */
function handleWindowResize(): void {
    if (state.cachedCanvasWidth && floatingControls.style.display === 'block') {
        setupOverlayCanvas(canvas, markerOverlay);
        updateMarkerWrapper();
    }
}

/**
 * Wrapper for updateMarker with proper parameters
 */
function updateMarkerWrapper(): void {
    if (!state.audioBuffer || !state.audioContext) return;

    const zOrderOffsetSeconds = parseFloat(zOrderOffsetInput.value);
    const bpm = parseFloat(bpmInput.value);
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * state.cachedSamplesPerBeat;
    const zOrderOffset = Math.round(zOrderOffsetSeconds * windowsPerSecond);

    const time = updateMarker({
        audioBuffer: state.audioBuffer,
        audioContext: state.audioContext,
        canvas: canvas,
        markerOverlay: markerOverlay,
        cachedCanvasWidth: state.cachedCanvasWidth,
        cachedCanvasHeight: state.cachedCanvasHeight,
        seekSlider: seekSlider,
        onGetPosition: (t: number) => getCanvasPositionForTime(t, {
            bpm: bpm,
            sampleRate: state.audioBuffer!.sampleRate,
            cachedSamplesPerBeat: state.cachedSamplesPerBeat,
            cachedCanvasWidth: state.cachedCanvasWidth,
            cachedCanvasHeight: state.cachedCanvasHeight,
            zOrderOffset: zOrderOffset,
            audioBuffer: state.audioBuffer
        }),
        onPausePlayback: () => pausePlayback({
            audioContext: state.audioContext!,
            playPauseButton: playPauseButton
        })
    });

    // Update time display
    currentTimeDisplay.textContent = formatTime(time);
    totalTimeDisplay.textContent = formatTime(state.audioBuffer.duration);

    // Continue animation loop if playing
    if (playbackState.isPlaying) {
        playbackState.animationFrameId = requestAnimationFrame(updateMarkerWrapper);
    }
}

/**
 * Main audio processing function
 */
async function processAudio(): Promise<void> {
    if (state.isProcessing || !state.audioBuffer) return;

    state.isProcessing = true;
    emptyState.style.display = 'none';
    canvasContainer.style.display = 'flex';
    canvas.style.display = '';
    progressContainer.classList.add('active');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    const bpm = parseFloat(bpmInput.value);
    const samplesPerBeat = parseInt(samplesPerBeatInput.value);
    const windowSize = parseInt(windowSizeInput.value);
    const zOrderOffsetSeconds = parseFloat(zOrderOffsetInput.value);
    const vizMode = modeRgbInput.checked ? 'rgb' : 'mono';

    const sampleRate = state.audioBuffer.sampleRate;

    // Apply frequency filtering if in RGB mode
    let audioData: Float32Array | undefined;
    let filteredBands: FilteredBands | undefined;

    if (vizMode === 'rgb') {
        const lowMidCutoff = parseFloat(lowMidCutoffInput.value);
        const midHighCutoff = parseFloat(midHighCutoffInput.value);

        progressText.textContent = 'Filtering...';
        filteredBands = await applyFrequencyFiltering(state.audioBuffer, lowMidCutoff, midHighCutoff);
        progressText.textContent = '0%';
    } else {
        audioData = state.audioBuffer.getChannelData(0);
    }

    // Calculate window interval
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * samplesPerBeat;
    const windowIntervalSeconds = 1 / windowsPerSecond;
    const windowIntervalSamples = windowIntervalSeconds * sampleRate;

    // Calculate z-order offset in windows
    const zOrderOffset = Math.round(zOrderOffsetSeconds * windowsPerSecond);

    // Calculate number of windows
    const audioLength = vizMode === 'rgb' ? filteredBands!.low.length : audioData!.length;
    const totalWindows = Math.floor(audioLength / windowIntervalSamples);

    // Calculate canvas dimensions using optimal Z-order curve sizing
    const totalBits = Math.ceil(Math.log2(totalWindows));
    const xBits = Math.ceil(totalBits / 2);
    const yBits = Math.floor(totalBits / 2);
    const canvasWidth = Math.pow(2, xBits);
    const canvasHeight = Math.pow(2, yBits);

    // Update info badges
    const badges = calculatedInfo.querySelectorAll('.info-badge');
    badges[0].textContent = `Window: ${(windowIntervalSeconds * 1000).toFixed(2)} ms`;
    badges[1].textContent = `Canvas: ${canvasWidth}×${canvasHeight}`;

    // Setup canvas
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const imageData = ctx.createImageData(canvasWidth, canvasHeight);

    if (vizMode === 'mono') {
        await processMonoMode(audioData!, totalWindows, windowIntervalSamples, windowSize,
                              zOrderOffset, canvasWidth, canvasHeight, imageData);
    } else {
        await processRGBMode(filteredBands!, totalWindows, windowIntervalSamples, windowSize,
                            zOrderOffset, canvasWidth, canvasHeight, imageData);
    }

    progressFill.style.width = '100%';
    progressText.textContent = '100%';

    setTimeout(() => {
        progressContainer.classList.remove('active');
    }, 500);

    state.isProcessing = false;

    // Show playback controls after first successful process
    floatingControls.style.display = 'block';
    playPauseButton.disabled = false;
    setupOverlayCanvas(canvas, markerOverlay);
    playbackState.currentPlaybackTime = 0;
    updateMarkerWrapper();
}

/**
 * Process audio in mono mode
 */
async function processMonoMode(
    audioData: Float32Array,
    totalWindows: number,
    windowIntervalSamples: number,
    windowSize: number,
    zOrderOffset: number,
    canvasWidth: number,
    canvasHeight: number,
    imageData: ImageData
): Promise<void> {
    const powers: number[] = [];
    const minPower = 0;
    const tempMaxPower = state.maxPowerMono;

    for (let i = 0; i < totalWindows; i++) {
        const startSample = Math.round(i * windowIntervalSamples);
        const power = calculateRMSPower(audioData, startSample, windowSize);
        powers.push(power);

        const index = i + zOrderOffset;
        const { x, y } = getZOrderCoordinates(index, canvasWidth);

        if (x < canvasWidth && y < canvasHeight) {
            const color = powerToColor(power, minPower, tempMaxPower);
            const pixelIndex = (y * canvasWidth + x) * 4;
            imageData.data[pixelIndex] = color[0];
            imageData.data[pixelIndex + 1] = color[1];
            imageData.data[pixelIndex + 2] = color[2];
            imageData.data[pixelIndex + 3] = color[3];
        }

        if (i % 1000 === 0) {
            ctx.putImageData(imageData, 0, 0);
            const progress = (i / totalWindows) * 100;
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }

    // Find max power
    state.maxPowerMono = powers.reduce((max, p) => Math.max(max, p), 0);
    if (state.maxPowerMono === 0) state.maxPowerMono = 1.0;

    state.cachedPowers = powers;
    state.cachedRGBPowers = null;
    state.cachedCanvasWidth = canvasWidth;
    state.cachedCanvasHeight = canvasHeight;
    state.cachedSamplesPerBeat = parseInt(samplesPerBeatInput.value);
    state.cachedVizMode = 'mono';

    redrawCanvas(state, canvas, zOrderOffset);
}

/**
 * Process audio in RGB mode
 */
async function processRGBMode(
    filteredBands: FilteredBands,
    totalWindows: number,
    windowIntervalSamples: number,
    windowSize: number,
    zOrderOffset: number,
    canvasWidth: number,
    canvasHeight: number,
    imageData: ImageData
): Promise<void> {
    const lowPowers: number[] = [];
    const midPowers: number[] = [];
    const highPowers: number[] = [];
    const tempMaxRGB = { ...state.maxPowerRGB };

    for (let i = 0; i < totalWindows; i++) {
        const startSample = Math.round(i * windowIntervalSamples);

        const lowPower = calculateRMSPower(filteredBands.low, startSample, windowSize);
        const midPower = calculateRMSPower(filteredBands.mid, startSample, windowSize);
        const highPower = calculateRMSPower(filteredBands.high, startSample, windowSize);

        lowPowers.push(lowPower);
        midPowers.push(midPower);
        highPowers.push(highPower);

        const index = i + zOrderOffset;
        const { x, y } = getZOrderCoordinates(index, canvasWidth);

        if (x < canvasWidth && y < canvasHeight) {
            const pixelIndex = (y * canvasWidth + x) * 4;
            const normalizedLow = Math.min(1, lowPower / tempMaxRGB.low);
            const normalizedMid = Math.min(1, midPower / tempMaxRGB.mid);
            const normalizedHigh = Math.min(1, highPower / tempMaxRGB.high);

            imageData.data[pixelIndex] = Math.floor(normalizedLow * 255);
            imageData.data[pixelIndex + 1] = Math.floor(normalizedMid * 255);
            imageData.data[pixelIndex + 2] = Math.floor(normalizedHigh * 255);
            imageData.data[pixelIndex + 3] = 255;
        }

        if (i % 1000 === 0) {
            ctx.putImageData(imageData, 0, 0);
            const progress = (i / totalWindows) * 100;
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }

    // Find max powers
    state.maxPowerRGB.low = lowPowers.reduce((max, p) => Math.max(max, p), 0);
    state.maxPowerRGB.mid = midPowers.reduce((max, p) => Math.max(max, p), 0);
    state.maxPowerRGB.high = highPowers.reduce((max, p) => Math.max(max, p), 0);

    if (state.maxPowerRGB.low === 0) state.maxPowerRGB.low = 1.0;
    if (state.maxPowerRGB.mid === 0) state.maxPowerRGB.mid = 1.0;
    if (state.maxPowerRGB.high === 0) state.maxPowerRGB.high = 1.0;

    state.cachedRGBPowers = { low: lowPowers, mid: midPowers, high: highPowers };
    state.cachedPowers = null;
    state.cachedCanvasWidth = canvasWidth;
    state.cachedCanvasHeight = canvasHeight;
    state.cachedSamplesPerBeat = parseInt(samplesPerBeatInput.value);
    state.cachedVizMode = 'rgb';

    redrawCanvas(state, canvas, zOrderOffset);
}

/**
 * Show the help modal
 */
function showHelpModal(): void {
    helpModal.classList.add('show');
}

/**
 * Hide the help modal
 */
function hideHelpModal(): void {
    helpModal.classList.remove('show');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
