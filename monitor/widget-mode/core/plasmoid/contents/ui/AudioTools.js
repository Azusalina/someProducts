.pragma library

// Lift quiet playback without inventing motion during silence.
function enhance(samples) {
    return samples.map(value => {
        if (typeof value !== "number" || !isFinite(value) || value <= 0.0015) return 0
        return Math.min(1, 2.2 * Math.pow(Math.max(0, value - 0.0015), 0.55))
    })
}
