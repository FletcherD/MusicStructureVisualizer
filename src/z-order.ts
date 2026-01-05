// Z-Order Curve (Morton Order) Utilities
// Maps 1D indices to 2D coordinates using space-filling curve

import type { Coordinates } from './types.js';

/**
 * Interleave x and y coordinates to get Z-order index
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns Z-order index
 */
export function interleave(x: number, y: number): number {
    let z = 0;
    for (let i = 0; i < 16; i++) {
        z |= ((x & (1 << i)) << i) | ((y & (1 << i)) << (i + 1));
    }
    return z;
}

/**
 * Convert linear index to 2D coordinates using Z-order curve
 * @param index - Linear index
 * @param width - Canvas width (not used but kept for API compatibility)
 * @returns 2D coordinates
 */
export function getZOrderCoordinates(index: number, width: number): Coordinates {
    let x = 0, y = 0;
    for (let i = 0; i < 16; i++) {
        x |= (index & (1 << (2 * i))) >> i;
        y |= (index & (1 << (2 * i + 1))) >> (i + 1);
    }
    return { x, y };
}
