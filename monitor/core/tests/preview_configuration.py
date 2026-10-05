"""Exercise the preview's real Apply/Cancel wiring with isolated saved settings."""
import os
from pathlib import Path
import tempfile

with tempfile.TemporaryDirectory(prefix='monitor-preview-config-') as temp:
    os.environ['XDG_CONFIG_HOME'] = temp
    os.environ['QT_QPA_PLATFORM'] = 'offscreen'
    os.environ['QT_QUICK_BACKEND'] = 'software'
    from PySide6.QtCore import QObject, QMetaObject, QUrl
    from PySide6.QtQml import QQmlApplicationEngine
    from PySide6.QtWidgets import QApplication
    from PySide6.QtTest import QTest

    app = QApplication([])
    app.setOrganizationName('MonitorTests')
    app.setApplicationName('ConfigurePreview')
    engine = QQmlApplicationEngine()
    warnings = []
    engine.warnings.connect(lambda values: warnings.extend(str(value) for value in values))
    engine.load(QUrl.fromLocalFile(str(Path(__file__).parents[1]/'Preview.qml')))
    assert engine.rootObjects(), 'Preview did not load'
    root = engine.rootObjects()[0]
    preferences = root.findChild(QObject, 'previewPreferences')
    modules = root.findChild(QObject, 'previewModulesPage')
    appearance = root.findChild(QObject, 'previewAppearancePage')
    flows = root.findChild(QObject, 'previewFlowsPage')
    buttons = root.findChild(QObject, 'previewConfigurationButtons')
    config_window = root.findChild(QObject, 'previewConfiguration')
    original = preferences.property('enabledModules')

    assert QMetaObject.invokeMethod(root, 'configure')
    QTest.qWait(100)
    modules.setProperty('cfg_enabledModules', 'note')
    appearance.setProperty('cfg_textColorHex', '#aabbcc')
    appearance.setProperty('cfg_backgroundColorHex', '#102030')
    appearance.setProperty('cfg_backgroundOpacity', 70)
    flows.setProperty('cfg_cpuFlowColor', '#ff6633')
    assert preferences.property('enabledModules') == original
    assert preferences.property('backgroundOpacity') == 0
    assert preferences.property('cpuFlowColor') == ''
    assert QMetaObject.invokeMethod(buttons, 'rejected')
    assert not config_window.property('visible')
    assert QMetaObject.invokeMethod(root, 'configure')
    QTest.qWait(100)
    assert modules.property('cfg_enabledModules') == original
    assert appearance.property('cfg_backgroundOpacity') == 0
    assert flows.property('cfg_cpuFlowColor') == ''

    modules.setProperty('cfg_enabledModules', 'note')
    appearance.setProperty('cfg_textColorHex', '#aabbcc')
    appearance.setProperty('cfg_backgroundColorHex', '#102030')
    appearance.setProperty('cfg_backgroundOpacity', 70)
    flows.setProperty('cfg_cpuFlowColor', '#ff6633')
    assert QMetaObject.invokeMethod(buttons, 'applied')
    assert preferences.property('enabledModules') == 'note'
    assert preferences.property('textColorHex') == '#aabbcc'
    assert preferences.property('backgroundOpacity') == 70
    assert preferences.property('cpuFlowColor') == '#ff6633'
    assert config_window.property('visible'), 'Apply should leave settings open'
    assert QMetaObject.invokeMethod(buttons, 'accepted')
    assert not config_window.property('visible')
    assert not warnings, '\n'.join(warnings)
    root.close()
    engine.deleteLater()
    app.processEvents()
    print('Preview loads; drafts, Cancel, Apply and OK behave correctly; no QML warnings.')
