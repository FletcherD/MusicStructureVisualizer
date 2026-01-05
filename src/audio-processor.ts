// Audio Processing Utilities
// RMS power calculation and frequency band filtering

import type { FilteredBands } from './types.js';

/**
 * Calculate RMS (Root Mean Square) power of an audio window
 * @param audioData - Audio sample data
 * @param startSample - Start sample index
 * @param windowSize - Window size in samples
 * @returns RMS power value
 */
export function calculateRMSPower(
    audioData: Float32Array,
    startSample: number,
    windowSize: number
): number {
    let sum = 0;
    const endSample = Math.min(startSample + windowSize, audioData.length);
    const actualWindowSize = endSample - startSample;

    for (let i = startSample; i < endSample; i++) {
        sum += audioData[i] * audioData[i];
    }

    return Math.sqrt(sum / actualWindowSize);
}

/**
 * Apply frequency filtering to separate audio into 3 bands (low, mid, high)
 * Uses Web Audio API's OfflineAudioContext and BiquadFilterNode for performance
 * @param audioBuffer - Input audio buffer
 * @param lowMidCutoff - Frequency separating low and mid bands (Hz)
 * @param midHighCutoff - Frequency separating mid and high bands (Hz)
 * @returns Filtered audio data
 */
export async function applyFrequencyFiltering(
    audioBuffer: AudioBuffer,
    lowMidCutoff: number,
    midHighCutoff: number
): Promise<FilteredBands> {
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Create offline context with 3 channels (one for each band)
    const offlineCtx = new OfflineAudioContext(3, length, sampleRate);

    // Create source
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Create filters for each frequency band
    // Low band: Lowpass filter
    const lowFilter = offlineCtx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = lowMidCutoff;
    lowFilter.Q.value = 0.7071; // Butterworth response

    // Mid band: Bandpass filter
    const midFilter = offlineCtx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = Math.sqrt(lowMidCutoff * midHighCutoff); // Geometric mean
    midFilter.Q.value = Math.sqrt(lowMidCutoff * midHighCutoff) / (midHighCutoff - lowMidCutoff);

    // High band: Highpass filter
    const highFilter = offlineCtx.createBiquadFilter();
    highFilter.type = 'highpass';
    highFilter.frequency.value = midHighCutoff;
    highFilter.Q.value = 0.7071; // Butterworth response

    // Create channel merger
    const merger = offlineCtx.createChannelMerger(3);

    // Connect: source -> filters -> merger -> destination
    source.connect(lowFilter);
    source.connect(midFilter);
    source.connect(highFilter);
    lowFilter.connect(merger, 0, 0);
    midFilter.connect(merger, 0, 1);
    highFilter.connect(merger, 0, 2);
    merger.connect(offlineCtx.destination);

    // Start and render
    source.start(0);
    const filteredBuffer = await offlineCtx.startRendering();

    // Return the 3 filtered channels
    return {
        low: filteredBuffer.getChannelData(0),
        mid: filteredBuffer.getChannelData(1),
        high: filteredBuffer.getChannelData(2)
    };
}
