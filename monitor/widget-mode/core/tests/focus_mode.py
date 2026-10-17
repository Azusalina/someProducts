"""Exercise the actual fullscreen window and shared bridge timer with Qt key events."""
import os
from pathlib import Path
import time

os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QT_QUICK_BACKEND'] = 'software'
from PySide6.QtCore import QObject, QMetaObject, QUrl, Qt, Q_ARG
from PySide6.QtGui import QWindow, QColor
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtQuick import QQuickWindow
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

app = QApplication([])
engine = QQmlApplicationEngine()
warnings = []
engine.warnings.connect(lambda values: warnings.extend(str(value) for value in values))
engine.load(QUrl.fromLocalFile(str(Path(__file__).with_name('FocusFixture.qml').resolve())))
assert engine.rootObjects(), 'Fixture did not load'
root = engine.rootObjects()[0]
owner = root.findChild(QObject, 'focusTimerOwner')

def wait_for(check, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        QTest.qWait(25)
    raise AssertionError('Timed out waiting for focus timer condition')

def invoke(obj, method):
    assert QMetaObject.invokeMethod(obj, method)

def reading():
    return owner.property('readings').toVariant()['countdown']

def button(window, name):
    control = window.findChild(QObject, name)
    assert control and control.property('enabled'), name
    invoke(control, 'clicked')

wait_for(lambda: owner.property('session') and not owner.property('busy'))
token = owner.property('session')
invoke(root, 'start')
wait_for(lambda: reading().get('running'))
QTest.qWait(600)
before = reading()['seconds']
button(root, 'countdownFocus')
window = owner.property('focusWindow')
assert isinstance(window, QQuickWindow)
wait_for(lambda: window.visibility() == QWindow.FullScreen)
assert owner.property('session') == token
assert reading()['running'] and reading()['seconds'] <= before
QTest.qWait(100)
assert window.findChild(QObject, 'focusCountdownFace').property('ink').name() == '#aabbcc', (window.property('ink').name(), warnings)
wait_for(lambda: not owner.property('busy'))
button(window, 'countdownToggle')
wait_for(lambda: not reading()['running'])
paused = reading()['seconds']
QTest.keyClick(window, Qt.Key_Escape)
wait_for(lambda: not owner.property('focusOpen'))
QTest.qWait(400)
assert reading()['seconds'] == paused and owner.property('session') == token
invoke(owner, 'openFocus')
window = owner.property('focusWindow')
assert reading()['seconds'] == paused
face = window.findChild(QObject, 'focusCountdownFace')
invoke(face, 'beginEdit')
field = window.findChild(QObject, 'countdownTimeInput')
field.setProperty('text', '2935')
QTest.keyClick(window, Qt.Key_Return)
wait_for(lambda: reading()['seconds'] == 1775 and not reading()['running'])
assert not owner.property('countdownEditing')
assert window.grabWindow().save(str(Path(__file__).parents[2] / 'docs/preview-countdown-focus.png'))
# Escape while editing also exits and releases the shared editing guard.
invoke(face, 'beginEdit')
field.setProperty('text', '123')
QTest.keyClick(window, Qt.Key_Escape)
wait_for(lambda: not owner.property('focusOpen'))
assert not owner.property('countdownEditing') and reading()['seconds'] == 1775
invoke(owner, 'openFocus')
window = owner.property('focusWindow')
# Native close is an exit, and leaves the shared paused countdown intact.
window.close()
wait_for(lambda: not owner.property('focusOpen'))
assert owner.property('session') == token and reading()['seconds'] == 1775
assert QMetaObject.invokeMethod(root, 'preset', Q_ARG('QVariant', 1))
wait_for(lambda: reading()['seconds'] == 1 and not owner.property('busy'))
invoke(owner, 'openFocus')
window = owner.property('focusWindow')
face = window.findChild(QObject, 'focusCountdownFace')
button(window, 'countdownToggle')
wait_for(lambda: owner.property('countdownFinished'))
assert face.property('blinking')
QTest.keyClick(window, Qt.Key_Return)
wait_for(lambda: not owner.property('countdownFinished') and reading()['seconds'] == 1)
assert not face.property('blinking') and not reading()['running']
# Hiding the module also destroys its fullscreen window and closes its session.
owner.setProperty('active', False)
wait_for(lambda: owner.property('focusWindow') is None)
assert not owner.property('session')
assert not warnings, '\n'.join(warnings)
root.close()
engine.deleteLater()
app.processEvents()
print('Focus Mode: fullscreen, shared progress, pause, edit, Esc/close, completion Enter and module cleanup passed; no QML warnings.')
