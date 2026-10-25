"""Exercise the actual fullscreen window and shared bridge timer with Qt key events."""
import os
from pathlib import Path
import time

os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QT_QUICK_BACKEND'] = 'software'
from PySide6.QtCore import QObject, QMetaObject, QUrl, Qt, Q_ARG, QPoint
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

def focus_media(window, full_check=False):
    # Passive mouse tracking must work without clicking/focusing the widget.
    window.setProperty('mediaAwake', False)
    QTest.mouseMove(window, QPoint(80, 90))
    wait_for(lambda: window.property('mediaAwake'))
    panel = window.findChild(QObject, 'focusMediaPanel')
    wait_for(lambda: panel.property('opacity') > 0.99)
    button(window, 'mediaToggle')
    assert root.property('lastMediaService') == 'org.mpris.MediaPlayer2.FocusTest'
    ambient = window.findChild(QObject, 'focusAmbient')
    assert ambient.property('refreshInterval') == 75
    if full_check:
        wait_for(lambda: len(ambient.property('audioBars').toVariant()) > 0)
        # Deterministic rendering fixture: quiet input is lifted, silence is zero.
        ambient.setProperty('enabled', False)
        ambient.setProperty('audioBars', [0, 0.001, 0.01, 0.1] * 8)
        levels = ambient.property('levels').toVariant()
        assert levels[0] == levels[1] == 0 and levels[2] > 0.1 and levels[3] > 0.5
        QTest.qWait(250)
        assert window.grabWindow().save(str(Path(__file__).parents[2] / 'docs/preview-focus-media.png'))
        # Hover pins the corner player; leaving restarts the inactivity timer.
        QTest.mouseMove(window, QPoint(window.width() - 50, window.height() - 40))
        QTest.qWait(3300)
        assert window.property('mediaAwake')
        QTest.mouseMove(window, QPoint(100, 100))
        wait_for(lambda: not window.property('mediaAwake'), timeout=4)
        QTest.mouseMove(window, QPoint(window.width() // 2, window.height() // 2))
        wait_for(lambda: window.property('mediaAwake'))
        ambient.setProperty('enabled', True)

wait_for(lambda: owner.property('session') and not owner.property('busy'))
token = owner.property('session')
invoke(root, 'seedMedia')
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
focus_media(window, full_check=True)
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
focus_media(window)
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
print('Mouse media reveal/hide, hover pin, media routing and quiet-audio gain passed. Countdown/stopwatch fullscreen and milliseconds passed. Focus Mode: fullscreen, shared progress, Space start/pause, prominent status, edit, Esc/close, completion Enter and module cleanup passed; no QML warnings.')
