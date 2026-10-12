import QtQuick
import QtQuick.Controls

TextField {
    id: field
    property string hexValue: ""
    property bool allowEmpty: false
    function validValue(value) { return (allowEmpty && value.trim() === "") || /^#[0-9a-fA-F]{6}$/.test(value.trim()) }
    readonly property bool valid: validValue(text)
    signal validEdited(string value)
    text: hexValue
    placeholderText: "#aabbcc"
    maximumLength: 7
    selectByMouse: true
    onTextEdited: if (validValue(text)) validEdited(text.trim().toLowerCase())
    Accessible.description: "Hex color, for example #aabbcc"
}
