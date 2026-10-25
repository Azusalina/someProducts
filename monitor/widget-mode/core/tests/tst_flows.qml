import QtQuick
import QtTest
import "../plasmoid/contents/ui"
Item {
    width: 240; height: 80
    Sparkline { id: flow; width: 220; height: 60; sampleCount: 4; transitionDuration: 160 }
    Sparkline { id: audio; width: 220; height: 60; sampleCount: 0; transitionDuration: 160 }
    Sparkline { id: timed; width: 220; height: 60; timeSamples: []; historySeconds: 30; transitionDuration: 100 }
    PingCard { id: ping; width: 220; targets: [{url: "example.test", label: "Test", icon: ""}] }
    TestCase {
        name: "SmoothHistory"
        when: windowShown
        function reset(values) {
            flow.values = []
            flow.values = values
            tryCompare(flow, "scrollOffset", 0, 500)
        }
        function test_01_scrollPreservesPeakHeightAndSpacing() {
            reset([10,90,20,30])
            const old = flow.points()
            flow.values = [90,20,30,40]
            const start = flow.points()
            compare(start[1].value, 90)
            fuzzyCompare(start[1].x, old[1].x, 0.001)
            compare(start[1].y, old[1].y)
            wait(70)
            const middle = flow.points()
            verify(flow.scrollOffset > 0 && flow.scrollOffset < 1)
            verify(middle[1].x < old[1].x)
            compare(middle[1].y, old[1].y)
            compare(middle[1].value, 90)
            fuzzyCompare(middle[2].x-middle[1].x, old[2].x-old[1].x, 0.001)
            tryCompare(flow, "scrollOffset", 0, 500)
            const end = flow.points()
            compare(end[0].value, 90)
            compare(end[0].y, old[1].y)
            fuzzyCompare(end[0].x, old[0].x, 0.001)
        }
        function test_02_initialHistoryHasFixedTimeScale() {
            reset([20,50])
            const old=flow.points(), spacing=old[1].x-old[0].x
            flow.values=[20,50,70]
            const start=flow.points()
            fuzzyCompare(start[0].x,old[0].x,0.001)
            fuzzyCompare(start[1].x-start[0].x,spacing,0.001)
            tryCompare(flow,"scrollOffset",0,500)
            fuzzyCompare(flow.points()[1].x-flow.points()[0].x,spacing,0.001)
        }
        function test_03_interruptedScrollHasNoJump() {
            reset([10,90,20,30])
            flow.values=[90,20,30,40]
            wait(60)
            const old=flow.points()
            flow.values=[20,30,40,50]
            const next=flow.points()
            fuzzyCompare(next[1].x,old[1].x,0.001)
            compare(next[1].y,old[1].y)
            tryCompare(flow,"scrollOffset",0,500)
            compare(flow.displayed().join(","),"20,30,40,50")
        }
        function test_04_missingValuesAndResetDoNotMorph() {
            reset([10,null,20,30])
            flow.values=[null,20,30,40]
            compare(flow.points()[1].y,null)
            tryCompare(flow,"scrollOffset",0,500)
            compare(flow.points()[0].y,null)
            flow.values=[90,5]
            compare(flow.scrollOffset,0)
            compare(flow.historySeries.join(","),"90,5")
        }
        function test_05_pingScaleHasHeadroomAndHysteresis() {
            ping.histories={"example.test": [50,60]}
            const graph=findChild(ping,"pingFlow"), row=graph.parent
            compare(graph.maximum,100)
            ping.histories={"example.test": [60,61]}
            compare(graph.maximum,100)
            ping.histories={"example.test": [61,130]}
            compare(graph.maximum,200)
            ping.histories={"example.test": [12,13]}
            row.quietTicks=0
            for(let i=0;i<9;i++)row.observeScale()
            compare(graph.maximum,200)
            row.observeScale()
            compare(graph.maximum,20)
            ping.histories={}
            compare(graph.maximum,10)
        }
        function test_060_clockMovesWithoutReplies() {
            timed.timeSamples=[];timed.historySeconds=30
            const now=Date.now()/1000
            timed.timeSamples=[{at:now-10,value:90},{at:now,value:20}]
            const old=timed.points()[0], start=timed.windowEnd
            // Several times the old 100ms animation duration, with no reply.
            wait(400)
            const middle=timed.windowEnd
            verify(middle-start>0.25)
            wait(400)
            verify(timed.windowEnd-middle>0.25)
            const elapsed=timed.windowEnd-start
            fuzzyCompare(old.x-timed.points()[0].x,216*elapsed/30,0.001)
            compare(timed.points()[0].y,old.y)
            timed.historySeconds=60
            const wider=timed.points()[0], widerStart=timed.windowEnd
            wait(250)
            fuzzyCompare(wider.x-timed.points()[0].x,216*(timed.windowEnd-widerStart)/60,0.001)
        }
        function test_061_delayedReplyDoesNotJumpOrCatchUp() {
            timed.timeSamples=[];timed.historySeconds=30
            const now=Date.now()/1000
            timed.timeSamples=[{at:now-10,value:90},{at:now-1,value:null}]
            wait(350)
            const old=timed.points()[0], end=timed.windowEnd
            // Reply timestamps may be older than the current visible clock.
            timed.timeSamples=timed.timeSamples.concat([{at:now-0.5,value:20}])
            compare(timed.windowEnd,end)
            fuzzyCompare(timed.points()[0].x,old.x,0.001)
            compare(timed.points()[1].y,null)
            compare(timed.timedSeries[2].at,now-0.5)
            wait(250)
            verify(timed.windowEnd-end>0.15)
            verify(timed.windowEnd-end<0.6)
            compare(timed.points()[0].y,old.y)
        }
        function test_062_hiddenHistoryCatchesUpAndSourceResetReplacesData() {
            timed.visible=false
            const now=Date.now()/1000
            timed.timeSamples=[{at:now-1,value:70}]
            const before=timed.windowEnd
            wait(200)
            timed.visible=true
            tryVerify(()=>timed.windowEnd>before+0.1,500)
            timed.timeSamples=[{at:now-20,value:10}]
            compare(timed.timedSeries.length,1)
            compare(timed.timedSeries[0].value,10)
            verify(timed.windowEnd>=before)
        }
        function test_06_audioBinsStillInterpolateAmplitude() {
            audio.values=[20,80]
            tryCompare(audio,"mix",1,500)
            audio.values=[40,60]
            wait(70)
            verify(audio.displayed()[0]>20 && audio.displayed()[0]<40)
            tryCompare(audio,"mix",1,500)
        }
    }
}
