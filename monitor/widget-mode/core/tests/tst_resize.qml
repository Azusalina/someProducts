import QtQuick
import QtTest
import "../plasmoid/contents/ui"
import "../plasmoid/contents/ui/ResizeTools.js" as ResizeTools

Item {
    id: root
    width: 600; height: 600
    QtObject {
        id: prefs
        property string layoutHeights: "{}"
        property string layoutColumnWeights: "[1,1,1]"
        property string layoutSplits: "{}"
        property int noteHeight: 85
        property string noteText: "Note"
        property string noteExportUrl: ""
        property int todoHeight: 130
        property bool todoEnabled: true
        property string todoItems: '{"pending":[],"urgent":[]}'
    }
    NoteBoard { id: notes; width: 300; preferences: prefs }
    TestCase {
        name: "RectangularResize"
        when: windowShown
        function test_01_column_constraints() {
            for(const total of [200,300,580]) for(const count of [1,2,3]) {
                if(total<count*110)continue
                const saved=ResizeTools.split(total,count,"[1,1,1]",0,10000)
                const widths=ResizeTools.widths(total,count,saved)
                for(const w of widths)verify(w>=100)
                const sum=widths.reduce((a,b)=>a+b,0)+10*(count-1)
                fuzzyCompare(sum,total,0.01)
            }
        }
        function test_02_outer_rectangles_and_native_host_contract() {
            let released=false,positioned=false,saved=false
            const host={x:200,y:100,width:300,height:400,parent:null,applet:null,layout:{width:1000,height:800,releaseSpace:()=>released=true,positionItem:()=>positioned=true,save:()=>saved=true}}
            const applet={parent:host};host.applet=applet
            verify(ResizeTools.resizeHost(applet,"left",1000))
            compare(host.width,200);compare(host.x,300)
            verify(released&&positioned&&saved)
            const rectangle=ResizeTools.rectangle(host,"bottom",10000,1000,800)
            compare(rectangle.height,800);compare(rectangle.y,0)
        }
        function test_03_drag_split_preserves_rectangular_bounds() {
            const divider=findChild(notes,"todoDivider")
            const initial=divider.mapToItem(root,3,20)
            mousePress(divider,3,20)
            mouseMove(root,initial.x+35,initial.y,80)
            mouseRelease(root,initial.x+35,initial.y)
            tryVerify(()=>JSON.parse(prefs.layoutSplits).todos>0.5)
            const left=findChild(notes,"pendingTodoViewport"),right=findChild(notes,"urgentTodoViewport")
            verify(left.width>=70&&right.width>=70)
            verify(left.width>right.width)
        }
    }
}
