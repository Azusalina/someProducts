import QtQuick
import QtTest
import "../plasmoid/contents/ui"
import "../plasmoid/contents/ui/config"
import "../plasmoid/contents/ui/TodoTools.js" as TodoTools

Item {
    id: root
    width: 520; height: 720
    QtObject {
        id: prefs
        property string layoutSplits: "{}"
        property string layoutHeights: "{}"
        property string noteText: "A note"
        property int noteHeight: 85
        property string noteExportUrl: ""
        property bool todoEnabled: true
        property string todoPendingTitle: "pending"
        property string todoUrgentTitle: "urgent"
        property string todoPendingColor: ""
        property string todoUrgentColor: ""
        property int todoFontSize: 11
        property int todoHeight: 130
        property string todoItems: '{"pending":[],"urgent":[]}'
    }
    NoteBoard { id: board; width: 300; preferences: prefs }
    ConfigTodos { id: config; width: 500; height: 680; visible: false }
    TestCase {
        name: "Todos"
        when: windowShown
        function init() {
            board.visible=true;config.visible=false
            prefs.todoEnabled=true;prefs.todoPendingTitle="pending";prefs.todoUrgentTitle="urgent"
            prefs.todoPendingColor="";prefs.todoUrgentColor="";prefs.todoHeight=130;board.width=300
            prefs.todoItems=JSON.stringify({pending:[{id:"p1",text:"Write notes",done:false}],urgent:[{id:"u1",text:"Pay bill",done:false}]})
            wait(50)
        }
        function enter(field,value) {
            mouseClick(field)
            keyClick(Qt.Key_A,Qt.ControlModifier)
            keyClick(Qt.Key_Backspace)
            for(const ch of value) { if(ch === "\n") keyClick(Qt.Key_Return); else keyClick(ch) }
        }
        function test_01_placement_and_toggle() {
            const note=findChild(board,"noteCard"),todos=findChild(board,"todoCard")
            verify(todos.y>=note.y+note.height)
            compare(findChild(board,"pendingTodoTitle").text,"pending")
            compare(findChild(board,"urgentTodoTitle").text,"urgent")
            const divider=findChild(board,"todoDivider")
            compare(divider.width,7)
            compare(Math.round(divider.x+3.5),Math.round(todos.width/2))
            mouseClick(findChild(board,"todoToggle_p1"))
            compare(TodoTools.parse(prefs.todoItems).pending[0].done,true)
            compare(findChild(board,"todoText_p1").font.strikeout,true)
            compare(TodoTools.parse(prefs.todoItems).urgent[0].done,false)
            mouseClick(findChild(board,"todoToggle_p1"))
            compare(findChild(board,"todoText_p1").font.strikeout,false)
        }
        function test_02_narrow_colors_and_visibility() {
            board.width=200;prefs.todoPendingColor="#aabbcc";prefs.todoUrgentColor="#e06c75"
            compare(findChild(board,"todoText_p1").color,"#aabbcc")
            compare(findChild(board,"todoText_u1").color,"#e06c75")
            const left=findChild(board,"pendingTodoViewport"),right=findChild(board,"urgentTodoViewport")
            verify(left.width>70 && right.width>70)
            verify(Math.abs(left.width-right.width)<=1)
            const note=findChild(board,"noteCard")
            prefs.todoEnabled=false
            tryCompare(board,"height",note.height)
            prefs.todoEnabled=true
            tryVerify(()=>board.height>note.height)
        }
        function test_03_config_edits_preserve_completion_and_duplicates() {
            board.visible=false;config.visible=true
            const saved=TodoTools.toggle(prefs.todoItems,"pending","p1")
            config.cfg_todoItems=saved
            config.cfg_todoPendingTitle="pending";config.cfg_todoUrgentTitle="urgent"
            enter(findChild(config,"pendingTodoTitleSetting"),"Later")
            compare(config.cfg_todoPendingTitle,"Later")
            compare(prefs.todoPendingTitle,"pending") // Draft does not reach the widget until Apply.
            const input=findChild(config,"pendingTodoItemsSetting")
            enter(input,"Write notes\nNew task\nWrite notes")
            const tasks=TodoTools.parse(config.cfg_todoItems).pending
            compare(tasks.length,3)
            compare(tasks[0].done,true)
            compare(tasks[1].done,false)
            compare(tasks[2].done,false)
            verify(tasks[0].id!==tasks[2].id)
            config.cfg_todoItems=saved // Cancel/reopen restores the saved draft.
            compare(input.text,"Write notes")
        }
        function test_035_inlineAddEditDeleteAndCompletion() {
            const input=findChild(board,"pendingTodoInput")
            enter(input,"New task");keyClick(Qt.Key_Return)
            let tasks=TodoTools.parse(prefs.todoItems).pending
            compare(tasks.length,2)
            compare(input.text,"")
            const id=tasks[1].id
            mouseClick(findChild(board,"todoToggle_"+id))
            mouseClick(findChild(board,"todoText_"+id))
            const editor=findChild(board,"todoEdit_"+id)
            tryCompare(editor,"activeFocus",true)
            enter(editor,"Updated task");keyClick(Qt.Key_Return)
            tasks=TodoTools.parse(prefs.todoItems).pending
            compare(tasks[1].text,"Updated task")
            compare(tasks[1].done,true)
            mouseClick(findChild(board,"todoText_"+id))
            tryCompare(findChild(board,"todoEdit_"+id),"activeFocus",true)
            keyClick(Qt.Key_Delete)
            compare(TodoTools.parse(prefs.todoItems).pending.length,1)
            compare(TodoTools.parse(prefs.todoItems).urgent.length,1)
        }
        function test_04_render() {
            prefs.todoPendingTitle="pending";prefs.todoUrgentTitle="urgent"
            prefs.todoItems=JSON.stringify({pending:[{id:"p1",text:"Write notes",done:true},{id:"p2",text:"Read one chapter",done:false}],urgent:[{id:"u1",text:"Submit assignment",done:false}]})
            wait(50)
            let saved=false
            verify(board.grabToImage(result=>{verify(result.saveToFile("../docs/preview-todos.png"));saved=true}))
            tryVerify(()=>saved,3000)
        }
    }
}
