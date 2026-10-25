import QtQuick
Canvas {
    id: graph
    property var values: []
    // Optional timestamped history; null retains the legacy indexed/audio modes.
    property var timeSamples: null
    property real historySeconds: 30
    property var timedSeries: []
    property real windowEnd: 0
    readonly property bool timeHistory: timeSamples !== null
    property color ink: "#f5f5f4"
    property real maximum: 100
    // Positive: time history; zero: fixed frequency bins (CAVA).
    property int sampleCount: 40
    property int transitionDuration: 180
    property real strokeWidth: 1.2
    property real mix: 1
    property var previous: []
    property var current: []
    property var historySeries: []
    property real scrollOffset: 0
    clip: true
    function finite(value) { return typeof value === "number" && isFinite(value) }
    function same(a, b) { return a === b || (!finite(a) && !finite(b)) }
    function appended(before, next) {
        if (!before.length) return 0
        if (next.length > before.length && before.every((v,i) => same(v,next[i]))) return next.length-before.length
        if (before.length === sampleCount && next.length === sampleCount) {
            for (let count=1; count<sampleCount; ++count)
                if (before.slice(count).every((v,i) => same(v,next[i]))) return count
        }
        return 0
    }
    function displayed() {
        if (sampleCount > 0) return current.slice()
        return current.map((value, index) => finite(value) && finite(previous[index]) ? previous[index] + (value - previous[index]) * mix : value)
    }
    function points() {
        if (timeHistory) {
            const lower=windowEnd-Math.max(1,historySeconds)
            let first=timedSeries.findIndex(point => point.at >= lower)
            if(first < 0)first=timedSeries.length
            return timedSeries.slice(Math.max(0,first-1)).map(point => ({value: point.value,
                x: 2+(point.at-lower)/Math.max(1,historySeconds)*Math.max(0,width-4),
                y: finite(point.value) ? height-2-Math.max(0,Math.min(maximum,point.value))/maximum*Math.max(0,height-4) : null}))
        }
        const samples = sampleCount > 0 ? historySeries : displayed()
        const slots = Math.max(2, sampleCount || samples.length)
        const offset = sampleCount > 0 ? slots-samples.length+scrollOffset : 0
        return samples.map((value,index) => ({value: value,
            x: 2 + (offset+index)/(slots-1)*Math.max(0,width-4),
            y: finite(value) ? height-2-Math.max(0,Math.min(maximum,value))/maximum*Math.max(0,height-4) : null}))
    }
    onValuesChanged: {
        if (timeHistory) return
        const before = displayed()
        const next = sampleCount > 0 ? values.slice(-sampleCount) : values.slice()
        const count = sampleCount > 0 ? appended(current,next) : 0
        transition.stop()
        scroll.stop()
        current = next
        if (sampleCount > 0) {
            mix = 1
            if (count && scrollOffset+count <= sampleCount) {
                // Keep every old Y value; only translate the entire history on X.
                scrollOffset += count
                historySeries = historySeries.concat(next.slice(-count))
                const limit = sampleCount+Math.ceil(scrollOffset)+2
                if (historySeries.length > limit) historySeries = historySeries.slice(-limit)
                scroll.restart()
            } else {
                historySeries = next.slice()
                scrollOffset = 0
            }
        } else {
            previous = before
            mix = 0
            transition.restart()
        }
        requestPaint()
    }
    onTimeSamplesChanged: {
        const starting=timedSeries.length === 0
        timedSeries=(timeSamples || []).filter(point => finite(point.at)).slice(-1302)
        // Samples use Unix timestamps. Replies only change the data, never the
        // clock: a delayed probe must not stop or accelerate the visible window.
        if (timeHistory && starting) windowEnd=Date.now()/1000
        requestPaint()
    }
    FrameAnimation {
        running: graph.timeHistory && graph.visible && graph.timedSeries.length > 0
        onTriggered: graph.windowEnd=Date.now()/1000
    }
    onWindowEndChanged: requestPaint()
    onTimedSeriesChanged: requestPaint()
    onHistorySecondsChanged: requestPaint()
    NumberAnimation { id: transition; target: graph; property: "mix"; from: 0; to: 1; duration: graph.transitionDuration }
    NumberAnimation {
        id: scroll
        target: graph; property: "scrollOffset"; to: 0
        duration: graph.transitionDuration
        onFinished: { graph.historySeries = graph.current.slice(); graph.requestPaint() }
    }
    onMixChanged: requestPaint()
    onScrollOffsetChanged: requestPaint()
    onHistorySeriesChanged: requestPaint()
    onInkChanged: requestPaint()
    onMaximumChanged: requestPaint()
    onSampleCountChanged: { scroll.stop(); scrollOffset=0; historySeries=current.slice(); requestPaint() }
    onStrokeWidthChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        if (maximum <= 0) return
        const samples = points()
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
        for (const point of samples) {
            if (point.y === null) { finish(); last = null; length = 0; continue }
            if (!last) { ctx.beginPath(); ctx.moveTo(point.x, point.y) }
            else {
                const middle = (last.x + point.x) / 2
                ctx.bezierCurveTo(middle, last.y, middle, point.y, point.x, point.y)
            }
            last = point
            ++length
        }
        finish()
    }
}
