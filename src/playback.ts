// Audio Playback Controller
// Manages audio playback state and visual marker tracking

import { getZOrderCoordinates, interleave } from './z-order.js';
import type {
    PlaybackState,
    Coordinates,
    PositionParams,
    TimeParams,
    PlaybackParams,
    PauseParams,
    MarkerParams
} from './types.js';

// Playback state
export const playbackState: PlaybackState = {
    audioSource: null,
    isPlaying: false,
    playbackStartTime: 0,
    playbackStartOffset: 0,
    animationFrameId: null,
    currentPlaybackTime: 0
};

/**
 * Map audio time to canvas coordinates
 * @param time - Time in seconds
 * @param params - Parameters
 * @returns Canvas position or null if out of bounds
 */
export function getCanvasPositionForTime(time: number, params: PositionParams): Coordinates | null {
    const { bpm, sampleRate, cachedSamplesPerBeat, cachedCanvasWidth, cachedCanvasHeight, zOrderOffset } = params;

    if (!cachedSamplesPerBeat || !cachedCanvasWidth) return null;

    // Calculate window interval
    const beatsPerSecond = bpm / 60;
    const windowsPerSecond = beatsPerSecond * cachedSamplesPerBeat;
    const windowIntervalSeconds = 1 / windowsPerSecond;

    // Convert time to window index
    const windowIndex = Math.floor(time / windowIntervalSeconds);

    // Apply Z-order offset
    const adjustedIndex = windowIndex + zOrderOffset;

    // Get Z-order coordinates
    const { x, y } = getZOrderCoordinates(adjustedIndex, cachedCanvasWidth);

    // Check bounds
    if (x >= cachedCanvasWidth || y >= cachedCanvasHeight) return null;

    return { x, y };
}

/**
 * Reverse mapping: canvas coordinates to audio time
 * @param canvasX - Canvas X coordinate
 * @param canvasY - Canvas Y coordinate
 * @param params - Parameters
 * @returns Time in seconds or null if invalid
 */
export function getTimeForCanvasClick(canvasX: number, canvasY: number, params: TimeParams): number | null {
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
 * @param fromTime - Time to start from (seconds)
 * @param params - Parameters
 */
export async function startPlayback(fromTime: number, params: PlaybackParams): Promise<void> {
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
            playPauseButton.textContent = '▶';
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

    playPauseButton.textContent = '⏸';

    // Start animation loop
    if (onUpdateMarker) onUpdateMarker();
}

/**
 * Pause audio playback
 * @param params - Parameters
 */
export function pausePlayback(params: PauseParams): void {
    const { audioContext, playPauseButton } = params;

    if (!playbackState.isPlaying) return;

    // Calculate current position
    playbackState.currentPlaybackTime = playbackState.playbackStartOffset +
        (audioContext.currentTime - playbackState.playbackStartTime);

    // Stop audio
    stopPlayback();

    playbackState.isPlaying = false;
    playPauseButton.textContent = '▶';
}

/**
 * Stop playback (internal - cleans up resources)
 */
export function stopPlayback(): void {
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
 * @param params - Parameters
 * @returns Current time in seconds
 */
export function updateMarker(params: MarkerParams): number {
    const { audioBuffer, audioContext, canvas, markerOverlay, cachedCanvasWidth, cachedCanvasHeight,
            seekSlider, onGetPosition, onPausePlayback } = params;

    if (!markerOverlay || !canvas) return 0;

    // Calculate current time
    let time: number;
    if (playbackState.isPlaying) {
        time = playbackState.playbackStartOffset +
            (audioContext.currentTime - playbackState.playbackStartTime);

        // Check if playback finished
        if (time >= audioBuffer.duration) {
            time = audioBuffer.duration;
            onPausePlayback();
        }
    } else {
        time = playbackState.currentPlaybackTime;
    }

    // Update seek slider
    if (seekSlider) {
        seekSlider.value = ((time / audioBuffer.duration) * 100).toString();
    }

    // Get canvas position
    const position = onGetPosition(time);

    // Clear overlay
    const markerCtx = markerOverlay.getContext('2d');
    if (!markerCtx) return time;

    markerCtx.clearRect(0, 0, markerOverlay.width, markerOverlay.height);

    if (position) {
        // Draw circular marker
        const scaleX = markerOverlay.width / cachedCanvasWidth;
        const scaleY = markerOverlay.height / cachedCanvasHeight;
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
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Setup overlay canvas to match main canvas
 * @param canvas - Main canvas
 * @param markerOverlay - Overlay canvas
 */
export function setupOverlayCanvas(canvas: HTMLCanvasElement, markerOverlay: HTMLCanvasElement): void {
    // Show marker overlay canvas
    markerOverlay.style.display = 'block';

    // Match intrinsic canvas dimensions (not display size)
    markerOverlay.width = canvas.width;
    markerOverlay.height = canvas.height;
}
