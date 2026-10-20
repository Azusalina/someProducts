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
QTest.keyClick(window, Qt.Key_Space)
wait_for(lambda: not reading()['running'])
status = window.findChild(QObject, 'countdownStatus')
assert status.property('text') == 'Paused' and status.property('opacity') == 1
assert status.property('font').pixelSize() == 28
wait_for(lambda: not owner.property('busy'))
QTest.keyClick(window, Qt.Key_Space)
wait_for(lambda: reading()['running'])
assert status.property('text') == 'Running'
wait_for(lambda: not owner.property('busy'))
QTest.keyClick(window, Qt.Key_Space)
wait_for(lambda: not reading()['running'])
paused = reading()['seconds']
QTest.keyClick(window, Qt.Key_Escape)
wait_for(lambda: not owner.property('focusOpen'))
QTest.qWait(400)
assert reading()['seconds'] == paused and owner.property('session') == token
assert QMetaObject.invokeMethod(owner, 'openFocus', Q_ARG('QVariant', 'countdown'))
window = owner.property('focusWindow')
assert reading()['seconds'] == paused
face = window.findChild(QObject, 'focusCountdownFace')
invoke(face, 'beginEdit')
field = window.findChild(QObject, 'countdownTimeInput')
QTest.keyClick(window, Qt.Key_Space)
QTest.qWait(100)
assert not reading()['running'], 'Space in time editor must not start countdown'
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
assert QMetaObject.invokeMethod(owner, 'openFocus', Q_ARG('QVariant', 'countdown'))
window = owner.property('focusWindow')
# Native close is an exit, and leaves the shared paused countdown intact.
window.close()
wait_for(lambda: not owner.property('focusOpen'))
assert owner.property('session') == token and reading()['seconds'] == 1775
assert QMetaObject.invokeMethod(root, 'preset', Q_ARG('QVariant', 1))
wait_for(lambda: reading()['seconds'] == 1 and not owner.property('busy'))
assert QMetaObject.invokeMethod(owner, 'openFocus', Q_ARG('QVariant', 'countdown'))
window = owner.property('focusWindow')
face = window.findChild(QObject, 'focusCountdownFace')
button(window, 'countdownToggle')
wait_for(lambda: owner.property('countdownFinished'))
assert face.property('blinking')
QTest.keyClick(window, Qt.Key_Space)
QTest.qWait(100)
assert owner.property('countdownFinished'), 'Space must not reset a finished countdown'
QTest.keyClick(window, Qt.Key_Return)
wait_for(lambda: not owner.property('countdownFinished') and reading()['seconds'] == 1)
assert not face.property('blinking') and not reading()['running']
QTest.keyClick(window, Qt.Key_Escape)
wait_for(lambda: not owner.property('focusOpen'))
button(root, 'stopwatchFocus')
window = owner.property('focusWindow')
QTest.qWait(100)
wait_for(lambda: window.visibility() == QWindow.FullScreen)
face = window.findChild(QObject, 'focusStopwatchFace')
assert face and face.property('ink').name() == '#88ddaa'
assert owner.property('session') == token
text = window.findChild(QObject, 'stopwatchTime')
assert text.property('text') == '00:00:00.000'
wait_for(lambda: not owner.property('busy'))
QTest.keyClick(window, Qt.Key_Space)
wait_for(lambda: owner.property('readings').toVariant()['stopwatch']['running'])
QTest.qWait(120)
assert text.property('text') != '00:00:00.000'
assert len(text.property('text').split('.')[-1]) == 3
assert reading()['seconds'] == 1 and not reading()['running'], 'Stopwatch must not control countdown'
wait_for(lambda: not owner.property('busy'))
QTest.keyClick(window, Qt.Key_Space)
wait_for(lambda: not owner.property('readings').toVariant()['stopwatch']['running'])
frozen = text.property('text')
QTest.qWait(350)
assert text.property('text') == frozen
assert window.findChild(QObject, 'stopwatchStatus').property('text') == 'Paused'
assert window.grabWindow().save(str(Path(__file__).parents[2] / 'docs/preview-stopwatch-focus.png'))
QTest.keyClick(window, Qt.Key_Escape)
wait_for(lambda: not owner.property('focusOpen'))
button(root, 'stopwatchFocus')
window = owner.property('focusWindow')
QTest.qWait(100)
assert window.findChild(QObject, 'stopwatchTime').property('text') == frozen
face = window.findChild(QObject, 'focusStopwatchFace')
invoke(face, 'beginEdit')
window.findChild(QObject, 'stopwatchTimeInput').setProperty('text', '00:00:08')
QTest.keyClick(window, Qt.Key_Return)
wait_for(lambda: owner.property('readings').toVariant()['stopwatch']['seconds'] == 8)
assert window.findChild(QObject, 'stopwatchTime').property('text') == '00:00:08.000'
wait_for(lambda: not owner.property('busy'))
button(window, 'stopwatchReset')
wait_for(lambda: not owner.property('busy'))
assert owner.property('readings').toVariant()['stopwatch']['seconds'] == 8
# Hiding the module also destroys its fullscreen window and closes its session.
owner.setProperty('active', False)
wait_for(lambda: owner.property('focusWindow') is None)
assert not owner.property('session')
assert not warnings, '\n'.join(warnings)
root.close()
engine.deleteLater()
app.processEvents()
print('Countdown/stopwatch fullscreen and milliseconds passed. Focus Mode: fullscreen, shared progress, Space start/pause, prominent status, edit, Esc/close, completion Enter and module cleanup passed; no QML warnings.')
