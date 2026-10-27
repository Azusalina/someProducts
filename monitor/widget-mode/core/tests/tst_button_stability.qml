import QtQuick
import QtTest
import "../plasmoid/contents/ui"
Item {
    id: root
    width: 600; height: 450
    QtObject {
        id: prefs
        property int countdownSeconds: 60
        property int stopwatchSeconds: 0
    }
    TimerOwner { id: timers; serviceUrl: "http://127.0.0.1:17343"; preferences: prefs }
    PowerOwner { id: power; serviceUrl: "http://127.0.0.1:17343" }
    ClockFace { id: clock; width: 250; height: 180; owner: timers; kind: "stopwatch" }
    BatteryCard {
        id: battery
        x: 280; width: 280
        owner: power; stale: false
        status: ({profile:"balanced",profiles:["power-saver","balanced","performance"]})
    }
    SignalSpy { id: enabledChanges; target: findChild(clock,"stopwatchToggle"); signalName: "enabledChanged" }
    SignalSpy { id: powerEnabledChanges; target: findChild(battery,"keepAwakeButton"); signalName: "enabledChanged" }
    TestCase {
        name: "ButtonStability"
        when: windowShown
        function initTestCase() {
            timers.active=true;power.active=true
            tryVerify(()=>timers.session.length>0,4000)
        }
        function test_01_pollDoesNotFlashButtons() {
            const button=findChild(clock,"stopwatchToggle")
            tryVerify(()=>timers.request!==null && timers.operation==="poll",4000)
            compare(timers.busy,false);compare(button.enabled,true);compare(button.opacity,1)
            enabledChanges.clear()
            wait(1300)
            compare(enabledChanges.count,0)
            compare(button.opacity,1)
        }
        function test_02_clickDuringPollIsAppliedOnce() {
            const button=findChild(clock,"stopwatchToggle")
            tryVerify(()=>timers.request!==null && timers.operation==="poll",4000)
            mouseClick(button)
            verify(timers.busy)
            tryVerify(()=>timers.readings.stopwatch.running===true,3000)
            tryCompare(timers,"busy",false,3000)
            tryVerify(()=>timers.request!==null && timers.operation==="poll",4000)
            mouseClick(button)
            tryVerify(()=>timers.readings.stopwatch.running===false,3000)
        }
        function test_03_heartbeatDoesNotFlashAndClickIsRetained() {
            const button=findChild(battery,"keepAwakeButton")
            mouseClick(button)
            tryCompare(power,"awake",true,3000)
            tryVerify(()=>power.request!==null && power.operation==="heartbeat",5000)
            compare(power.busy,false);compare(button.enabled,true);compare(button.opacity,1)
            powerEnabledChanges.clear()
            wait(150)
            compare(powerEnabledChanges.count,0)
            mouseClick(button)
            verify(power.busy)
            tryCompare(power,"awake",false,3000)
            tryCompare(power,"busy",false,3000)
            compare(power.error,"")
        }
        function test_04_profileChangeDuringHeartbeatIsRetained() {
            power.toggle()
            tryCompare(power,"awake",true,3000)
            tryVerify(()=>power.request!==null && power.operation==="heartbeat",5000)
            const button=findChild(battery,"power_balanced")
            compare(button.enabled,true);compare(button.opacity,1)
            mouseClick(button)
            verify(power.busy)
            tryCompare(power,"busy",false,3000)
            compare(power.error,"")
            power.toggle()
            tryCompare(power,"awake",false,3000)
        }
        function cleanupTestCase() { timers.active=false;power.active=false }
    }
}
