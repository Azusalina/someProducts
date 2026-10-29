"""Real Selenium + supplied exporter against an offline five-page fixture."""
import importlib.util
from pathlib import Path
import tempfile
import os
import unittest
from pypdf import PdfReader
root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('adapter', root / 'src/scribd/worker.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class ScribdExporter(unittest.TestCase):
    def test_real_batch_pdf_pages_geometry_and_content(self):
        html = '''<!doctype html><style>.outer_page{width:400px;height:600px}.newpage{width:100%;height:100%;background:white;color:black;font:24px sans-serif}.landscape{width:600px;height:400px}</style><div class="document_scroller"></div><script>
        window.docManager={pages:{}};
        for(let i=1;i<=5;i++){
          const outer=document.createElement('div');outer.className='outer_page'+(i===2?' landscape':'');outer.id='outer_page_'+i;
          const inner=document.createElement('div');inner.className='newpage';inner.textContent='Fixture page '+i;outer.append(inner);document.querySelector('.document_scroller').append(outer);
          docManager.pages[i]={pageNum:i,innerPageElem:inner,loadHasStarted:true,display(){},turnOnImages(){this._imagesTurnedOn=true;},load(){},remove(){inner.remove();this.innerPageElem=null;}};
        }</script>'''
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / 'fixture.html').write_text(html)
            os.environ['SCRIBD_EXPORT_BATCH_SIZE'] = '2'
            adapter.export_document('https://www.scribd.com/document/123/fixture', path / 'result.pdf', root / 'src/scribd-downloader', fixture=path / 'fixture.html')
            result = PdfReader(str(path / 'result.pdf'))
            self.assertEqual(len(result.pages), 5)
            for index, page in enumerate(result.pages):
                self.assertIn('Fixture page ' + str(index + 1), page.extract_text())
                self.assertAlmostEqual(float(page.mediabox.width), 450 if index == 1 else 300, delta=2)
                self.assertAlmostEqual(float(page.mediabox.height), 300 if index == 1 else 450, delta=2)
            self.assertFalse(any(path.glob('chrome-profile-*')))


if __name__ == '__main__':
    unittest.main()
