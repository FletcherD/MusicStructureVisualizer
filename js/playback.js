// Audio Playback Controller
// Manages audio playback state and visual marker tracking

import { getZOrderCoordinates, interleave } from './z-order.js';

// Playback state
export const playbackState = {
    audioSource: null,           // Current AudioBufferSourceNode
    isPlaying: false,            // Playing/paused state
    playbackStartTime: 0,        // audioContext.currentTime when playback started
    playbackStartOffset: 0,      // Audio buffer offset (for pause/resume)
    animationFrameId: null,      // For canceling requestAnimationFrame
    currentPlaybackTime: 0       // Current position in seconds
};

/**
 * Map audio time to canvas coordinates
 * @param {number} time - Time in seconds
 * @param {object} params - Parameters (bpm, sampleRate, cachedSamplesPerBeat, cachedCanvasSize, zOrderOffset, audioBuffer)
 * @returns {{x: number, y: number}|null} Canvas position or null if out of bounds
 */
export function getCanvasPositionForTime(time, params) {
    const { bpm, sampleRate, cachedSamplesPerBeat, cachedCanvasSize, zOrderOffset } = params;

    if (!cachedSamplesPerBeat || !cachedCanvasSize) return null;

    // Calculate window interval
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * cachedSamplesPerBeat;
    const windowIntervalSeconds = 1 / windowsPerSecond;

    // Convert time to window index
    const windowIndex = Math.floor(time / windowIntervalSeconds);

    // Apply Z-order offset
    const adjustedIndex = windowIndex + zOrderOffset;

    // Get Z-order coordinates
    const { x, y } = getZOrderCoordinates(adjustedIndex, cachedCanvasSize);

    // Check bounds
    if (x >= cachedCanvasSize || y >= cachedCanvasSize) return null;

    return { x, y };
}

/**
 * Reverse mapping: canvas coordinates to audio time
 * @param {number} canvasX - Canvas X coordinate
 * @param {number} canvasY - Canvas Y coordinate
 * @param {object} params - Parameters (bpm, sampleRate, cachedSamplesPerBeat, zOrderOffset, audioDuration)
 * @returns {number|null} Time in seconds or null if invalid
 */
export function getTimeForCanvasClick(canvasX, canvasY, params) {
    const { bpm, sampleRate, cachedSamplesPerBeat, zOrderOffset, audioDuration } = params;

    if (!cachedSamplesPerBeat) return null;

    // Calculate window interval
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * cachedSamplesPerBeat;
    const windowIntervalSeconds = 1 / windowsPerSecond;

    // Convert canvas coordinates to Z-order index
    const zOrderIndex = interleave(Math.floor(canvasX), Math.floor(canvasY));

    // Remove Z-order offset
    const windowIndex = zOrderIndex - zOrderOffset;

    // Convert window index to time
    const time = windowIndex * windowIntervalSeconds;

    // Clamp to valid range
    if (time < 0 || time > audioDuration) return null;

    return time;
}

/**
 * Start or resume audio playback
 * @param {number} fromTime - Time to start from (seconds)
 * @param {object} params - Parameters (audioBuffer, audioContext, playPauseButton, callbacks)
 */
export async function startPlayback(fromTime, params) {
    const { audioBuffer, audioContext, playPauseButton, onUpdateMarker } = params;

    if (!audioBuffer || !audioContext) return;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Stop any existing playback
    stopPlayback();

    // Create new source (AudioBufferSourceNode can only be used once)
    playbackState.audioSource = audioContext.createBufferSource();
    playbackState.audioSource.buffer = audioBuffer;
    playbackState.audioSource.connect(audioContext.destination);

    // Handle playback end
    playbackState.audioSource.onended = () => {
        if (playbackState.isPlaying) {
            // Natural end (not user-triggered stop)
            playbackState.isPlaying = false;
            playPauseButton.textContent = 'Play';
            playbackState.currentPlaybackTime = 0;
            if (onUpdateMarker) onUpdateMarker();
        }
    };

    // Start playback from specified time
    const duration = audioBuffer.duration - fromTime;
    playbackState.audioSource.start(0, fromTime, duration);

    playbackState.playbackStartTime = audioContext.currentTime;
    playbackState.playbackStartOffset = fromTime;
    playbackState.isPlaying = true;

    playPauseButton.textContent = 'Pause';

    // Start animation loop
    if (onUpdateMarker) onUpdateMarker();
}

/**
 * Pause audio playback
 * @param {object} params - Parameters (audioContext, playPauseButton)
 */
export function pausePlayback(params) {
    const { audioContext, playPauseButton } = params;

    if (!playbackState.isPlaying) return;

    // Calculate current position
    playbackState.currentPlaybackTime = playbackState.playbackStartOffset +
        (audioContext.currentTime - playbackState.playbackStartTime);

    // Stop audio
    stopPlayback();

    playbackState.isPlaying = false;
    playPauseButton.textContent = 'Play';
}

/**
 * Stop playback (internal - cleans up resources)
 */
export function stopPlayback() {
    if (playbackState.audioSource) {
        // Clear onended callback to prevent it from firing when we stop manually
        playbackState.audioSource.onended = null;
        try {
            playbackState.audioSource.stop();
        } catch (e) {
            // Already stopped or never started
        }
        playbackState.audioSource.disconnect();
        playbackState.audioSource = null;
    }

    if (playbackState.animationFrameId) {
        cancelAnimationFrame(playbackState.animationFrameId);
        playbackState.animationFrameId = null;
    }
}

/**
 * Update marker position (called every frame while playing)
 * @param {object} params - Parameters (audioBuffer, audioContext, canvas, markerOverlay, cachedCanvasSize, callbacks)
 */
export function updateMarker(params) {
    const { audioBuffer, audioContext, canvas, markerOverlay, cachedCanvasSize,
            seekSlider, onGetPosition, onPausePlayback } = params;

    if (!markerOverlay || !canvas) return;

    // Calculate current time
    let time;
    if (playbackState.isPlaying) {
        time = playbackState.playbackStartOffset +
            (audioContext.currentTime - playbackState.playbackStartTime);

        // Check if playback finished
        if (time >= audioBuffer.duration) {
            time = audioBuffer.duration;
            if (onPausePlayback) onPausePlayback();
        }
    } else {
        time = playbackState.currentPlaybackTime;
    }

    // Update time display and seek slider (handled by caller)
    if (seekSlider) {
        seekSlider.value = (time / audioBuffer.duration) * 100;
    }

    // Get canvas position
    const position = onGetPosition ? onGetPosition(time) : null;

    // Clear overlay
    const markerCtx = markerOverlay.getContext('2d');
    markerCtx.clearRect(0, 0, markerOverlay.width, markerOverlay.height);

    if (position) {
        // Draw circular marker
        const scaleX = markerOverlay.width / cachedCanvasSize;
        const scaleY = markerOverlay.height / cachedCanvasSize;
        const centerX = (position.x + 0.5) * scaleX;
        const centerY = (position.y + 0.5) * scaleY;
        const radius = Math.max(scaleX, scaleY) * 3;

        markerCtx.beginPath();
        markerCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        markerCtx.fillStyle = 'rgba(255, 255, 100, 0.4)';
        markerCtx.fill();
        markerCtx.strokeStyle = 'rgba(255, 255, 100, 0.8)';
        markerCtx.lineWidth = 2;
        markerCtx.stroke();
    }

    // Return current time for display
    return time;
}

/**
 * Format seconds to MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Setup overlay canvas to match main canvas
 * @param {HTMLCanvasElement} canvas - Main canvas
 * @param {HTMLCanvasElement} markerOverlay - Overlay canvas
 */
export function setupOverlayCanvas(canvas, markerOverlay) {
    // Show marker overlay canvas
    markerOverlay.style.display = 'block';

    // Position overlay exactly over main canvas
    markerOverlay.width = canvas.width;
    markerOverlay.height = canvas.height;
    markerOverlay.style.width = canvas.style.width;
    markerOverlay.style.height = canvas.style.height;

    // Calculate canvas position within parent container
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = canvas.parentElement.getBoundingClientRect();
    markerOverlay.style.left = `${canvasRect.left - containerRect.left}px`;
    markerOverlay.style.top = `${canvasRect.top - containerRect.top}px`;
}
