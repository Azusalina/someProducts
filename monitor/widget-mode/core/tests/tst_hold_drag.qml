import QtQuick
import QtQuick.Controls
import QtTest
import "../plasmoid/contents/ui"
Item {
    id: root
    width: 500; height: 400
    property int clicks: 0
    property point origin
    property bool follow: false
    property point panelOrigin
    Item {
        id: panel
        x: 20; y: 30; width: 200; height: 140
        Button { id: button; x: 10; y: 10; text: "Control"; onClicked: root.clicks++ }
        HoldDrag {
            id: hold
            anchors.fill: parent
            z: 100
            holdSeconds: 0.12
            onStarted: position => { root.origin=position; root.panelOrigin=Qt.point(panel.x,panel.y) }
            onMoved: position => { if(root.follow) {panel.x=root.panelOrigin.x+position.x-root.origin.x;panel.y=root.panelOrigin.y+position.y-root.origin.y} }
        }
    }
    DragGrip { id: grip; x:350; y:50; detached:true }
    SignalSpy { id: gripStarted; target:grip; signalName:"moveStarted" }
    SignalSpy { id: gripUpdated; target:grip; signalName:"moveUpdated" }
    SignalSpy { id: gripFinished; target:grip; signalName:"moveFinished" }
    SignalSpy { id: started; target: hold; signalName: "started" }
    SignalSpy { id: moved; target: hold; signalName: "moved" }
    SignalSpy { id: finished; target: hold; signalName: "finished" }
    TestCase {
        name: "HoldToMove"
        when: windowShown
        function init() { started.clear(); moved.clear(); finished.clear(); hold.enabled=true; root.follow=false;panel.x=20;panel.y=30 }
        function test_clickStillControlsButton() {
            const before=root.clicks
            mouseClick(button,button.width/2,button.height/2)
            compare(root.clicks,before+1)
            compare(started.count,0)
        }
        function test_holdAndDragAcrossPanel() {
            mousePress(panel,100,100)
            tryCompare(started,"count",1,600)
            mouseMove(root,170,180,30)
            tryVerify(()=>moved.count>0,500)
            mouseMove(root,250,210,30)
            mouseRelease(root,250,210)
            tryCompare(finished,"count",1,500)
            compare(hold.armed,false)
            compare(hold.moving,false)
        }
        function test_movingHostDoesNotAccumulateOffset() {
            root.follow=true
            mousePress(panel,100,100)
            tryCompare(started,"count",1,600)
            mouseMove(root,157,159,30)
            tryCompare(panel,"x",57,500)
            compare(panel.y,59)
            mouseMove(root,178,176,30)
            tryCompare(panel,"x",78,500)
            compare(panel.y,76)
            mouseRelease(root,178,176)
            tryCompare(finished,"count",1,500)
        }
        function test_detachedHandleHoldMovesLive() {
            gripStarted.clear();gripUpdated.clear();gripFinished.clear()
            mousePress(grip,8,8)
            tryCompare(gripStarted,"count",1,800)
            mouseMove(root,380,90,30)
            verify(gripUpdated.count>0)
            mouseRelease(root,380,90)
            compare(gripFinished.count,1)
            compare(grip.live,false)
        }
        function test_shortDragIsNotMovement() {
            mousePress(panel,100,100)
            mouseMove(root,200,200,20)
            mouseRelease(root,200,200)
            compare(started.count,0)
            compare(finished.count,0)
        }
        function test_cancelOnDisable() {
            mousePress(panel,100,100)
            tryCompare(started,"count",1,600)
            hold.enabled=false
            compare(hold.armed,false)
            mouseRelease(root,120,130)
            compare(finished.count,0)
        }
    }
}
