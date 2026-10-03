import QtQuick
Canvas {
    id: graph
    property var values: []
    property color ink: "#f5f5f4"
    property real maximum: 100
    property int sampleCount: 40
    property int transitionDuration: 180
    property real strokeWidth: 1.2
    property real mix: 1
    property var previous: []
    property var current: []
    function finite(value) { return typeof value === "number" && isFinite(value) }
    function displayed() {
        return current.map((value, index) => finite(value) && finite(previous[index]) ? previous[index] + (value - previous[index]) * mix : value)
    }
    onValuesChanged: {
        const before = displayed()
        transition.stop()
        current = values.slice()
        // History shifts are new samples, not changes to old measurements.
        previous = sampleCount > 0 ? current : before
        mix = sampleCount > 0 ? 1 : 0
        if (sampleCount === 0) transition.restart()
        requestPaint()
    }
    NumberAnimation { id: transition; target: graph; property: "mix"; from: 0; to: 1; duration: graph.transitionDuration }
    onMixChanged: requestPaint()
    onInkChanged: requestPaint()
    onMaximumChanged: requestPaint()
    onSampleCountChanged: requestPaint()
    onStrokeWidthChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        const samples = displayed()
        if (!samples.length || maximum <= 0) return
        const slots = Math.max(2, sampleCount || samples.length)
        const offset = sampleCount > 0 ? Math.max(0, slots - samples.length) : 0
        ctx.strokeStyle = Qt.rgba(ink.r, ink.g, ink.b, 0.8)
        ctx.fillStyle = ctx.strokeStyle
        ctx.lineWidth = strokeWidth
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        let last = null
        let length = 0
        function finish() {
            if (length > 1) ctx.stroke()
            else if (length === 1) { ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fill() }
        }
        for (let i = 0; i < samples.length; ++i) {
            if (!finite(samples[i])) { finish(); last = null; length = 0; continue }
            const x = 2 + (offset + i) / (slots - 1) * (width - 4)
            const y = height - 2 - Math.max(0, Math.min(maximum, samples[i])) / maximum * (height - 4)
            if (!last) { ctx.beginPath(); ctx.moveTo(x, y) }
            else {
                const middle = (last.x + x) / 2
                ctx.bezierCurveTo(middle, last.y, middle, y, x, y)
            }
            last = {x: x, y: y}
            ++length
        }
        finish()
    }
}
