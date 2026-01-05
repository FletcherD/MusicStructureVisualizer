// Visualization and Canvas Rendering
// Handles color mapping and canvas drawing

import { viridisMap } from './constants.js';
import { getZOrderCoordinates } from './z-order.js';
import type { AppState, RGBAColor } from './types.js';

/**
 * Convert power value to color using Viridis colormap
 * @param power - Power value to convert
 * @param minPower - Minimum power in range
 * @param maxPower - Maximum power in range
 * @returns RGBA color array
 */
export function powerToColor(power: number, minPower: number, maxPower: number): RGBAColor {
    // Handle edge case where all powers are the same
    if (minPower === maxPower) {
        const [r, g, b] = viridisMap[128]; // Use middle color
        return [r, g, b, 255];
    }

    const normalized = (power - minPower) / (maxPower - minPower);
    const index = Math.floor(Math.max(0, Math.min(1, normalized)) * 255);
    const [r, g, b] = viridisMap[index];
    return [r, g, b, 255];
}

/**
 * Redraw canvas using cached power data with current Z-order offset
 * @param state - Application state containing cached data and settings
 * @param canvas - Target canvas element
 * @param zOrderOffset - Z-order offset in samples
 */
export function redrawCanvas(state: AppState, canvas: HTMLCanvasElement, zOrderOffset: number): void {
    const { cachedPowers, cachedRGBPowers, cachedCanvasWidth, cachedCanvasHeight, cachedVizMode, maxPowerMono, maxPowerRGB } = state;

    if (!cachedPowers && !cachedRGBPowers) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create new image data
    const imageData = ctx.createImageData(cachedCanvasWidth, cachedCanvasHeight);

    // Clear to black
    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i + 3] = 255; // Set alpha to opaque
    }

    if (cachedVizMode === 'mono' && cachedPowers) {
        // Mono mode: Use Viridis colormap with normalized scale
        const minPower = 0;
        const maxPower = maxPowerMono;

        for (let i = 0; i < cachedPowers.length; i++) {
            const index = i + zOrderOffset;
            const { x, y } = getZOrderCoordinates(index, cachedCanvasWidth);

            if (x < cachedCanvasWidth && y < cachedCanvasHeight) {
                const color = powerToColor(cachedPowers[i], minPower, maxPower);
                const pixelIndex = (y * cachedCanvasWidth + x) * 4;
                imageData.data[pixelIndex] = color[0];
                imageData.data[pixelIndex + 1] = color[1];
                imageData.data[pixelIndex + 2] = color[2];
                imageData.data[pixelIndex + 3] = color[3];
            }
        }
    } else if (cachedRGBPowers) {
        // RGB mode: Map frequency bands to RGB channels with normalization
        for (let i = 0; i < cachedRGBPowers.low.length; i++) {
            const index = i + zOrderOffset;
            const { x, y } = getZOrderCoordinates(index, cachedCanvasWidth);

            if (x < cachedCanvasWidth && y < cachedCanvasHeight) {
                const pixelIndex = (y * cachedCanvasWidth + x) * 4;
                // Normalize each band by its max power, then scale to 0-255
                const normalizedLow = Math.min(1, cachedRGBPowers.low[i] / maxPowerRGB.low);
                const normalizedMid = Math.min(1, cachedRGBPowers.mid[i] / maxPowerRGB.mid);
                const normalizedHigh = Math.min(1, cachedRGBPowers.high[i] / maxPowerRGB.high);

                imageData.data[pixelIndex] = Math.floor(normalizedLow * 255);
                imageData.data[pixelIndex + 1] = Math.floor(normalizedMid * 255);
                imageData.data[pixelIndex + 2] = Math.floor(normalizedHigh * 255);
                imageData.data[pixelIndex + 3] = 255;
            }
        }
    }

    // Render to canvas
    ctx.putImageData(imageData, 0, 0);
}
