// Shared Type Definitions for WebFFT

/**
 * RGB power values for frequency bands
 */
export interface RGBPowers {
    low: number[];
    mid: number[];
    high: number[];
}

/**
 * Maximum power levels for RGB normalization
 */
export interface MaxPowerRGB {
    low: number;
    mid: number;
    high: number;
}

/**
 * Filtered audio bands
 */
export interface FilteredBands {
    low: Float32Array;
    mid: Float32Array;
    high: Float32Array;
}

/**
 * Application state
 */
export interface AppState {
    audioContext: AudioContext | null;
    audioBuffer: AudioBuffer | null;
    isProcessing: boolean;
    cachedPowers: number[] | null;
    cachedRGBPowers: RGBPowers | null;
    cachedCanvasWidth: number;
    cachedCanvasHeight: number;
    cachedSamplesPerBeat: number;
    cachedVizMode: 'mono' | 'rgb';
    maxPowerMono: number;
    maxPowerRGB: MaxPowerRGB;
}

/**
 * Playback state
 */
export interface PlaybackState {
    audioSource: AudioBufferSourceNode | null;
    isPlaying: boolean;
    playbackStartTime: number;
    playbackStartOffset: number;
    animationFrameId: number | null;
    currentPlaybackTime: number;
}

/**
 * 2D coordinates
 */
export interface Coordinates {
    x: number;
    y: number;
}

/**
 * Parameters for canvas position calculation
 */
export interface PositionParams {
    bpm: number;
    sampleRate: number;
    cachedSamplesPerBeat: number;
    cachedCanvasWidth: number;
    cachedCanvasHeight: number;
    zOrderOffset: number;
    audioBuffer?: AudioBuffer;
}

/**
 * Parameters for time calculation from canvas click
 */
export interface TimeParams {
    bpm: number;
    sampleRate: number;
    cachedSamplesPerBeat: number;
    zOrderOffset: number;
    audioDuration: number;
}

/**
 * Parameters for playback functions
 */
export interface PlaybackParams {
    audioBuffer: AudioBuffer;
    audioContext: AudioContext;
    playPauseButton: HTMLButtonElement;
    onUpdateMarker?: () => void;
}

/**
 * Parameters for pause function
 */
export interface PauseParams {
    audioContext: AudioContext;
    playPauseButton: HTMLButtonElement;
}

/**
 * Parameters for marker update
 */
export interface MarkerParams {
    audioBuffer: AudioBuffer;
    audioContext: AudioContext;
    canvas: HTMLCanvasElement;
    markerOverlay: HTMLCanvasElement;
    cachedCanvasWidth: number;
    cachedCanvasHeight: number;
    seekSlider: HTMLInputElement | null;
    onGetPosition: (time: number) => Coordinates | null;
    onPausePlayback: () => void;
}

/**
 * RGBA color
 */
export type RGBAColor = [number, number, number, number];

/**
 * RGB color from Viridis map
 */
export type RGBColor = [number, number, number];
