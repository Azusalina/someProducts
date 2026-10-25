#!/usr/bin/env python3
"""Native, local Toolkit client. Processing reuses Toolkit through a private pipe."""
import argparse
import ctypes
import json
import math
import os
from pathlib import Path
import signal
import sys
import tempfile
import tomllib

from PySide6.QtCore import Qt, QProcess, QTimer
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPen, QImage, QKeySequence, QShortcut
from PySide6.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QFileDialog, QComboBox, QLineEdit, QSpinBox, QDoubleSpinBox,
    QListWidget, QStackedWidget, QFormLayout, QMessageBox, QProgressBar)
from shiboken6 import getCppPointer

ROOT = Path(__file__).resolve().parent
TOOLKIT = ROOT.parent / 'toolkit'
CONFIG = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'toolkit-desktop/config.toml'
TOOLS = {
    'tex-pdf': ('TeX → PDF', 'Compile a separate PDF locally', '.pdf'),
    'markdown-pdf': ('Markdown → PDF', 'Formatted paper from your notes', '.pdf'),
    'pdf-markdown': ('PDF → Markdown', 'Extract editable text locally', '.md'),
    'pdf-pages': ('PDF pages', 'Keep, reorder or remove pages', '.pdf'),
    'photos-pdf': ('Photos → PDF', 'One page per photo, in order', '.pdf'),
    'audio-mp3': ('Convert to MP3', 'Small, widely supported audio', '.mp3'),
    'audio-flac': ('Convert to FLAC', 'Lossless encoding of decoded audio', '.flac'),
    'omr': ('Prepare score scan', 'A separate candidate for human review', '.pdf'),
}
IMAGES = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp', '.tif', '.tiff'}
MEDIA = {'.mp3', '.flac', '.wav', '.m4a', '.aac', '.opus', '.ogg', '.aiff', '.mp4', '.mkv', '.webm', '.mov'}


def available_tools(paths):
    suffixes = [Path(p).suffix.lower() for p in paths]
    if suffixes and all(s in IMAGES for s in suffixes):
        return ['photos-pdf']
    if len(suffixes) != 1:
        return []
    if suffixes[0] in {'.md', '.markdown'}:
        return ['markdown-pdf']
    if suffixes[0] == '.tex':
        return ['tex-pdf']
    if suffixes[0] == '.pdf':
        return ['pdf-markdown', 'pdf-pages', 'omr']
    if suffixes[0] in MEDIA:
        return ['audio-mp3', 'audio-flac']
    return []


def publish_result(staging, destination, originals):
    """Atomically create a new result. Never replace an original or existing name."""
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError('That name already exists. Choose a new result filename.')
    if destination.resolve() in {Path(p).resolve() for p in originals}:
        raise ValueError('Save the result separately from the original.')
    os.link(staging, destination)  # same filesystem, atomic, exclusive create


class Glass(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.Window | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setWindowTitle('Toolkit')
        self.setMinimumSize(520, 520)
        self.resize(560, 560)
        self.setStyleSheet('''
            QWidget { color: #f6f6fa; font-family: "Noto Sans"; font-size: 14px; }
            QLabel#eyebrow { color: #c9c7dc; font-size: 11px; letter-spacing: 3px; }
            QLabel#title { font-size: 25px; font-weight: 600; }
            QLabel#detail { color: #d3d1df; font-size: 12px; }
            QPushButton { background: rgba(255,255,255,22); border: 1px solid rgba(255,255,255,40); border-radius: 16px; padding: 12px 16px; }
            QPushButton:hover, QPushButton:focus { background: rgba(198,183,255,65); border-color: #d6cafa; }
            QPushButton:disabled { color: #908c9f; }
            QPushButton#primary { background: #ded5fa; color: #262333; font-weight: 600; }
            QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox { background: rgba(0,0,0,60); border: 1px solid #7d778c; border-radius: 8px; padding: 8px; selection-background-color: #76649c; }
            QComboBox QAbstractItemView { background: #33303d; selection-background-color: #625477; }
            QListWidget { background: transparent; border: none; outline: none; }
            QListWidget::item { padding: 17px; margin-bottom: 6px; border-radius: 14px; background: rgba(255,255,255,15); }
            QListWidget::item:selected { background: rgba(198,183,255,60); }
            QProgressBar { border: none; background: #474153; border-radius: 4px; height: 5px; }
            QProgressBar::chunk { background: #d7c9ff; border-radius: 4px; }
        ''')
        QShortcut(QKeySequence('Escape'), self, self.escape)
        self._blur = None
        self.round_menu = False

    def escape(self):
        self.close()

    def paintEvent(self, _event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        rect = self.rect().adjusted(1, 1, -1, -1)
        painter.setBrush(QColor(34, 31, 45, 205))
        painter.setPen(QPen(QColor(244, 236, 255, 90), 1))
        if self.round_menu: painter.drawEllipse(rect)
        else: painter.drawRoundedRect(rect, 30, 30)
        painter.setPen(QPen(QColor(255, 255, 255, 20), 1))
        if self.round_menu:
            painter.drawEllipse(rect.adjusted(4, 4, -4, -4))
            painter.setPen(QPen(QColor(234, 223, 255, 30), 1))
            painter.drawEllipse(self.rect().center(), 160, 160)
        else: painter.drawRoundedRect(rect.adjusted(4, 4, -4, -4), 27, 27)

    def showEvent(self, event):
        super().showEvent(event)
        self.apply_blur()

    def apply_blur(self):
        try:
            self._blur = ctypes.CDLL(str(ROOT / 'build/libtoolkit-glass.so'))
            self._blur.toolkit_blur.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
            self._blur.toolkit_blur(ctypes.c_void_p(getCppPointer(self.windowHandle())[0]), self.width(), self.height(), self.width() // 2 if self.round_menu else 30)
        except (OSError, AttributeError):
            pass  # Translucent tint is usable when compositor blur is unavailable.

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton and event.position().y() < 65:
            self.windowHandle().startSystemMove()


class ToolkitWindow(Glass):
    def __init__(self, paths, vertical=False):
        super().__init__()
        self.paths = [str(Path(p).expanduser().resolve(strict=True)) for p in paths]
        if any(not Path(p).is_file() for p in self.paths):
            raise ValueError('Choose regular local files.')
        if any(Path(p).stat().st_size > 100 * 1024 * 1024 for p in self.paths):
            raise ValueError('Choose files up to 100 MB each.')
        self.tools = available_tools(self.paths)
        self.operation = None
        self.job = None
        self.work = None
        self.cancelled = False
        self.vertical = vertical
        self.round_menu = not vertical and bool(self.tools)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 22, 28, 24)
        header = QHBoxLayout()
        eyebrow = QLabel('T O O L K I T'); eyebrow.setObjectName('eyebrow')
        header.addWidget(eyebrow); header.addStretch()
        close = QPushButton('×'); close.setFixedSize(36, 36); close.setStyleSheet('padding:0; border-radius:18px;'); close.setAccessibleName('Close Toolkit')
        close.clicked.connect(self.close); header.addWidget(close); layout.addLayout(header)
        self.eyebrow, self.close_button = eyebrow, close
        self.stack = QStackedWidget(); layout.addWidget(self.stack, 1)
        self.menu = QWidget(); self.stack.addWidget(self.menu)
        self.build_menu()
        self.form_page = QWidget(); self.stack.addWidget(self.form_page)
        self.form_layout = QVBoxLayout(self.form_page)
        self.status = QLabel('Originals stay unchanged.'); self.status.setWordWrap(True); self.status.setObjectName('detail')
        layout.addWidget(self.status)
        self.progress = QProgressBar(); self.progress.setRange(0, 0); self.progress.hide(); layout.addWidget(self.progress)
        self.stack.currentChanged.connect(self.shape_changed)
        self.shape_changed(0)
        self.screen().availableGeometry()

    def shape_changed(self, index):
        self.round_menu = index == 0 and not self.vertical and bool(self.tools)
        self.eyebrow.setVisible(not self.round_menu); self.close_button.setVisible(not self.round_menu)
        self.status.setAlignment(Qt.AlignCenter if self.round_menu else Qt.AlignLeft)
        self.status.setVisible(not self.round_menu)
        self.update()
        if self.isVisible(): self.apply_blur()

    def build_menu(self):
        if self.vertical or not self.tools:
            layout = QVBoxLayout(self.menu)
            title = QLabel('Choose a tool'); title.setObjectName('title'); layout.addWidget(title)
            filename = QLabel('\n'.join(Path(p).name for p in self.paths)); filename.setWordWrap(True); filename.setObjectName('detail'); layout.addWidget(filename)
            self.list = QListWidget()
            for tool in self.tools: self.list.addItem(TOOLS[tool][0] + '\n' + TOOLS[tool][1])
            self.list.itemActivated.connect(lambda _: self.choose(self.tools[self.list.currentRow()]))
            self.list.itemClicked.connect(lambda _: self.choose(self.tools[self.list.currentRow()]))
            layout.addWidget(self.list)
            if self.tools: self.list.setCurrentRow(0); QTimer.singleShot(0, self.list.setFocus)
            else: layout.addWidget(QLabel('No file tool matches this selection.\nChoose a PDF, Markdown, photo or audio file.'))
        else:
            # Circular arrangement; every target is a real accessible Qt button.
            count = len(self.tools)
            center = QLabel(self.menu); center.setGeometry(134, 154, 230, 100)
            center.setAlignment(Qt.AlignCenter); center.setWordWrap(True)
            center.setText(Path(self.paths[0]).name if len(self.paths) == 1 else f'{len(self.paths)} photos')
            center.setStyleSheet('font-size:17px; font-weight:600;')
            label = QLabel('T O O L K I T', self.menu); label.setGeometry(160, 140, 180, 22); label.setAlignment(Qt.AlignCenter); label.setObjectName('eyebrow')
            close = QPushButton('×', self.menu); close.setGeometry(230, 270, 40, 40); close.setStyleSheet('padding:0; border-radius:20px;'); close.setAccessibleName('Close Toolkit'); close.clicked.connect(self.close)
            for index, tool in enumerate(self.tools):
                angle = -math.pi / 2 + index * math.tau / max(count, 3)
                x = round(248 + math.cos(angle) * 153 - 91)
                y = round(240 + math.sin(angle) * 155 - 36)
                button = QPushButton(TOOLS[tool][0], self.menu)
                button.setGeometry(x, y, 182, 72)
                button.setToolTip(TOOLS[tool][1]); button.clicked.connect(lambda _checked=False, t=tool: self.choose(t))
                QShortcut(QKeySequence(str(index + 1)), self, lambda t=tool: self.choose(t))

    def choose(self, operation):
        self.operation = operation
        while self.form_layout.count():
            item = self.form_layout.takeAt(0)
            if item.widget(): item.widget().deleteLater()
            if item.layout():
                while item.layout().count():
                    child = item.layout().takeAt(0)
                    if child.widget(): child.widget().deleteLater()
        back = QPushButton('‹  All tools'); back.clicked.connect(lambda: self.stack.setCurrentIndex(0)); self.form_layout.addWidget(back)
        title = QLabel(TOOLS[operation][0]); title.setObjectName('title'); self.form_layout.addWidget(title)
        detail = QLabel(TOOLS[operation][1]); detail.setWordWrap(True); detail.setObjectName('detail'); self.form_layout.addWidget(detail)
        source = QLabel('\n'.join(self.paths)); source.setWordWrap(True); source.setTextInteractionFlags(Qt.TextSelectableByMouse); self.form_layout.addWidget(source)
        form = QFormLayout(); self.form_layout.addLayout(form)
        self.controls = {}
        def combo(name, label, choices):
            widget = QComboBox()
            for text, data in choices: widget.addItem(text, data)
            self.controls[name] = widget; form.addRow(label, widget)
        if operation in {'markdown-pdf', 'photos-pdf'}:
            papers = [('A4', 'A4'), ('Letter', 'Letter')]
            if operation == 'photos-pdf': papers.append(('Fit photo', 'photo'))
            combo('paper', 'Paper', papers)
        if operation == 'markdown-pdf': combo('background', 'Paper color', [('White', 'white'), ('Yellow', 'yellow'), ('Black', 'black')])
        if operation == 'pdf-pages':
            combo('pageMode', 'Method', [('Keep / reorder', 'keep'), ('Delete pages', 'delete')])
            pages = QLineEdit(); pages.setPlaceholderText('1-3, 7, 5'); form.addRow('Original page numbers', pages); self.controls['pages'] = pages
        if operation == 'omr':
            combo('profile', 'Method', [('Preserve pixels', 'preserve'), ('Contrast normalization', 'contrast'), ('Manual deskew', 'deskew')])
            page = QSpinBox(); page.setRange(1, 100000); form.addRow('Page', page); self.controls['page'] = page
            rotation = QDoubleSpinBox(); rotation.setRange(-5, 5); rotation.setSingleStep(.1); form.addRow('Rotation (degrees)', rotation); self.controls['rotation'] = rotation
            note = QLabel('This prepares one page for review. It does not recognize notes or establish accuracy.'); note.setWordWrap(True); self.form_layout.addWidget(note)
        if operation == 'photos-pdf':
            photos = QListWidget(); photos.addItems([Path(p).name for p in self.paths]); self.form_layout.addWidget(photos)
            row = QHBoxLayout()
            for text, delta in [('Move earlier', -1), ('Move later', 1)]:
                button = QPushButton(text)
                def move(_checked=False, d=delta):
                    index = photos.currentRow(); target = index + d
                    if index >= 0 and 0 <= target < len(self.paths):
                        self.paths[index], self.paths[target] = self.paths[target], self.paths[index]
                        item = photos.takeItem(index); photos.insertItem(target, item); photos.setCurrentRow(target)
                button.clicked.connect(move); row.addWidget(button)
            self.form_layout.addLayout(row)
        self.form_layout.addStretch()
        self.save = QPushButton('Choose result path & save…'); self.save.setObjectName('primary'); self.save.clicked.connect(self.start)
        self.form_layout.addWidget(self.save)
        self.stack.setCurrentWidget(self.form_page)

    def start(self):
        if self.job is not None: return
        options = {}
        for key, widget in self.controls.items():
            options[key] = widget.currentData() if isinstance(widget, QComboBox) else widget.text() if isinstance(widget, QLineEdit) else widget.value()
        suffix = TOOLS[self.operation][2]
        initial = Path(self.paths[0]).with_name(Path(self.paths[0]).stem + '-result' + suffix)
        destination, _ = QFileDialog.getSaveFileName(self, 'Save a separate result', str(initial), f'Result (*{suffix})')
        if not destination: return
        destination = Path(destination)
        if not destination.suffix: destination = destination.with_suffix(suffix)
        if destination.suffix.lower() != suffix:
            QMessageBox.information(self, 'Result filename', f'Use a {suffix} filename for this tool.'); return
        if destination.exists() or destination.is_symlink():
            QMessageBox.information(self, 'Choose a new filename', 'That name already exists. Choose a new result filename.'); return
        try:
            self.work = tempfile.TemporaryDirectory(prefix='.toolkit-', dir=destination.parent)
            inputs = self.paths.copy()
            if self.operation == 'photos-pdf':
                inputs = []
                for index, source in enumerate(self.paths):
                    image = QImage(source)
                    if image.isNull() or image.width() * image.height() > 40_000_000:
                        raise ValueError('Choose readable photos up to 40 megapixels.')
                    output = Path(self.work.name) / f'photo-{index}.png'
                    if not image.save(str(output), 'PNG'): raise ValueError('Could not prepare the photo.')
                    inputs.append(str(output))
            staging = Path(self.work.name) / ('result' + suffix)
            self.destination, self.staging = destination, staging
            self.cancelled = False
            self.job = QProcess(self)
            self.job.setProgram('setsid')
            self.job.setArguments(['node', str(TOOLKIT / 'src/desktop/worker.mjs')])
            self.job.finished.connect(self.finished)
            self.job.errorOccurred.connect(self.process_error)
            self.job.start()
            self.job.write(json.dumps(dict(operation=self.operation, inputs=inputs, output=str(staging), options=options)).encode())
            self.job.closeWriteChannel()
            self.form_page.setEnabled(False); self.progress.show(); self.status.setText('Processing locally…  Esc to cancel')
        except Exception as error:
            if self.work: self.work.cleanup(); self.work = None
            self.status.setText(str(error))

    def process_error(self, error):
        if error == QProcess.FailedToStart: self.finished(-1, QProcess.CrashExit)

    def finished(self, code, _status):
        if self.job is None: return
        job, self.job = self.job, None
        try:
            if self.cancelled: self.status.setText('Cancelled. No result was saved.')
            elif code != 0: self.status.setText(bytes(job.readAllStandardError()).decode(errors='replace')[-1800:] or job.errorString())
            else:
                publish_result(self.staging, self.destination, self.paths)
                self.status.setText(f'Saved: {self.destination}')
        except Exception as error: self.status.setText(str(error))
        finally:
            if self.work: self.work.cleanup(); self.work = None
            self.progress.hide(); self.form_page.setEnabled(True); job.deleteLater()

    def escape(self):
        if self.job is None: self.close()
        else: self.cancel()

    def cancel(self):
        if self.job is None: return
        self.cancelled = True; self.status.setText('Cancelling…')
        job = self.job
        try: os.killpg(job.processId(), signal.SIGTERM)
        except ProcessLookupError: pass
        def force():
            if self.job is job:
                try: os.killpg(job.processId(), signal.SIGKILL)
                except ProcessLookupError: pass
        QTimer.singleShot(3000, force)

    def closeEvent(self, event):
        if self.job is not None:
            self.cancel(); event.ignore()
        else: event.accept()


def main():
    parser = argparse.ArgumentParser(description='Native Toolkit file actions')
    parser.add_argument('--list', action='store_true', help='Vertical, keyboard-friendly FileX menu')
    parser.add_argument('--radial', action='store_true', help='Circular desktop menu (default)')
    parser.add_argument('--clicked', nargs=2, type=int, metavar=('X', 'Y'))
    parser.add_argument('--pid', type=int)
    parser.add_argument('--frame', nargs=4, type=int)
    parser.add_argument('--window-title')
    parser.add_argument('files', nargs='*')
    args = parser.parse_args()
    app = QApplication(sys.argv)
    app.setApplicationName('toolkit-desktop'); app.setApplicationDisplayName('Toolkit')
    try:
        paths = args.files
        if args.clicked:
            from clicked_file import resolve_clicked
            if not args.pid: raise ValueError('A clicked window process is required.')
            paths = [resolve_clicked(*args.clicked, args.pid, args.frame, args.window_title)]
        if not paths:
            paths, _ = QFileDialog.getOpenFileNames(None, 'Choose files for Toolkit', str(Path.home()), 'Files (*.md *.markdown *.tex *.pdf *.png *.jpg *.jpeg *.webp *.avif *.mp3 *.flac *.wav *.m4a *.ogg *.opus *.mp4 *.mkv *.webm);;All files (*)')
        if not paths: return 0
        window = ToolkitWindow(paths, args.list)
        window.show()
        return app.exec()
    except Exception as error:
        QMessageBox.critical(None, 'Toolkit', str(error)); return 1


if __name__ == '__main__':
    raise SystemExit(main())
