import QtQuick
Canvas {
    id: graph
    property var values: []
    property color ink: "#f5f5f4"
    onValuesChanged: requestPaint()
    onInkChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        if (values.length < 2) return
        ctx.strokeStyle = Qt.rgba(ink.r, ink.g, ink.b, 0.5)
        ctx.lineWidth = 1.3
        ctx.beginPath()
        for (let i = 0; i < values.length; ++i) {
            const x = i / (values.length - 1) * width
            const y = height - 2 - Math.max(0, Math.min(100, values[i])) / 100 * (height - 4)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }
}
