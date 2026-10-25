import os
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import QApplication, ToolkitWindow, available_tools, publish_result
from clicked_file import local_directory


class DesktopTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.app = QApplication.instance() or QApplication([])

    def test_file_specific_menus_and_native_method_page(self):
        self.assertEqual(available_tools(['score.pdf']), ['pdf-markdown', 'pdf-pages', 'omr'])
        self.assertEqual(available_tools(['notes.tex']), ['tex-pdf'])
        self.assertEqual(available_tools(['a.PNG', 'b.webp']), ['photos-pdf'])
        self.assertEqual(available_tools(['a.pdf', 'b.md']), [])
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'notes.tex'; source.write_text('test')
            w = ToolkitWindow([source], vertical=True)
            w.show(); self.app.processEvents()
            self.assertEqual(w.list.count(), 1)
            w.choose('tex-pdf'); self.app.processEvents()
            self.assertEqual(w.stack.currentIndex(), 1)
            w.close()

    def test_atomic_result_never_clobbers_existing_files_or_links(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); source = root / 'source'; source.write_bytes(b'original')
            staged = root / 'staged'; staged.write_bytes(b'result')
            result = root / 'result'
            publish_result(staged, result, [source]); self.assertEqual(result.read_bytes(), b'result')
            with self.assertRaises(ValueError): publish_result(staged, result, [source])
            with self.assertRaises(ValueError): publish_result(staged, source, [source])
            link = root / 'link'; link.symlink_to(source)
            with self.assertRaises(ValueError): publish_result(staged, link, [source])
            self.assertEqual(source.read_bytes(), b'original')

    def test_accessibility_directory_preserves_spaces_and_refuses_guesses(self):
        with tempfile.TemporaryDirectory(prefix='toolkit space ') as folder:
            self.assertEqual(local_directory('Localized description at ' + folder), Path(folder).resolve())
            with self.assertRaises(ValueError): local_directory('search:/everything')


if __name__ == '__main__': unittest.main()
