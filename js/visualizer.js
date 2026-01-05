// Visualization and Canvas Rendering
// Handles color mapping and canvas drawing

import { viridisMap } from './constants.js';
import { getZOrderCoordinates } from './z-order.js';

/**
 * Convert power value to color using Viridis colormap
 * @param {number} power - Power value to convert
 * @param {number} minPower - Minimum power in range
 * @param {number} maxPower - Maximum power in range
 * @returns {number[]} RGBA color array [r, g, b, a]
 */
export function powerToColor(power, minPower, maxPower) {
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
 * @param {object} state - Application state containing cached data and settings
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {number} zOrderOffset - Z-order offset in samples
 */
export function redrawCanvas(state, canvas, zOrderOffset) {
    const { cachedPowers, cachedRGBPowers, cachedCanvasSize, cachedVizMode, maxPowerMono, maxPowerRGB } = state;

    if (!cachedPowers && !cachedRGBPowers) return;

    const ctx = canvas.getContext('2d');

    // Create new image data
    const imageData = ctx.createImageData(cachedCanvasSize, cachedCanvasSize);

    // Clear to black
    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i + 3] = 255; // Set alpha to opaque
    }

    if (cachedVizMode === 'mono') {
        // Mono mode: Use Viridis colormap with normalized scale
        const minPower = 0;
        const maxPower = maxPowerMono;

        for (let i = 0; i < cachedPowers.length; i++) {
            const index = i + zOrderOffset;
            const { x, y } = getZOrderCoordinates(index, cachedCanvasSize);

            if (x < cachedCanvasSize && y < cachedCanvasSize) {
                const color = powerToColor(cachedPowers[i], minPower, maxPower);
                const pixelIndex = (y * cachedCanvasSize + x) * 4;
                imageData.data[pixelIndex] = color[0];
                imageData.data[pixelIndex + 1] = color[1];
                imageData.data[pixelIndex + 2] = color[2];
                imageData.data[pixelIndex + 3] = color[3];
            }
        }
    } else {
        // RGB mode: Map frequency bands to RGB channels with normalization
        for (let i = 0; i < cachedRGBPowers.low.length; i++) {
            const index = i + zOrderOffset;
            const { x, y } = getZOrderCoordinates(index, cachedCanvasSize);

            if (x < cachedCanvasSize && y < cachedCanvasSize) {
                const pixelIndex = (y * cachedCanvasSize + x) * 4;
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
