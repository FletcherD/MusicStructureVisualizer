// Z-Order Curve (Morton Order) Utilities
// Maps 1D indices to 2D coordinates using space-filling curve

/**
 * Interleave x and y coordinates to get Z-order index
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {number} Z-order index
 */
export function interleave(x, y) {
    let z = 0;
    for (let i = 0; i < 16; i++) {
        z |= ((x & (1 << i)) << i) | ((y & (1 << i)) << (i + 1));
    }
    return z;
}

/**
 * Convert linear index to 2D coordinates using Z-order curve
 * @param {number} index - Linear index
 * @param {number} width - Canvas width (not used but kept for API compatibility)
 * @returns {{x: number, y: number}} 2D coordinates
 */
export function getZOrderCoordinates(index, width) {
    let x = 0, y = 0;
    for (let i = 0; i < 16; i++) {
        x |= (index & (1 << (2 * i))) >> i;
        y |= (index & (1 << (2 * i + 1))) >> (i + 1);
    }
    return { x, y };
}
