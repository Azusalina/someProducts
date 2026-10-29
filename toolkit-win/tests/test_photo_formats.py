"""Independent pixel/tag and RAW-decoder checks for TIFF/DNG conversion."""
import sys
from pathlib import Path
import tempfile
import unittest
import numpy as np
import rawpy
import tifffile
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src' / 'formats'))
from photo import convert


class PhotoFormats(unittest.TestCase):
    def test_tiff16_rgb_and_orientation(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            pixels = np.arange(48 * 64 * 3, dtype=np.uint16).reshape(48, 64, 3) * 5
            tifffile.imwrite(p / 'source.tif', pixels, photometric='rgb', extratags=[(274, 'H', 1, 6, False)])
            convert(p / 'source.tif', p / 'out.tiff', 'tiff')
            np.testing.assert_array_equal(tifffile.imread(p / 'out.tiff'), np.rot90(pixels, -1))

    def test_linear_dng_color_and_full_depth(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            Image.new('RGB', (64, 48), (120, 180, 220)).save(p / 'source.png')
            convert(p / 'source.png', p / 'out.dng', 'dng')
            with tifffile.TiffFile(p / 'out.dng') as f:
                self.assertEqual(f.pages[0].photometric, 34892)
                self.assertEqual(bytes(f.pages[0].tags[50706].value), bytes((1, 4, 0, 0)))
                self.assertEqual(f.asarray().dtype, np.uint16)
            # Independent RAW reader must recognize the produced file and colors.
            with rawpy.imread(str(p / 'out.dng')) as raw:
                rgb = raw.postprocess(use_camera_wb=True, no_auto_bright=True, gamma=(2.4, 12.92))
                np.testing.assert_allclose(rgb[24, 32], (120, 180, 220), atol=2)
            convert(p / 'out.dng', p / 'rendered.tiff', 'tiff')
            self.assertEqual(tifffile.imread(p / 'rendered.tiff').dtype, np.uint16)

    def test_cfa_dng_import_not_preview(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            pixels = np.full((64, 80), 16000, dtype=np.uint16)
            tags = [(50706,'B',4,(1,4,0,0),False),(50707,'B',4,(1,1,0,0),False),
                    (50708,'s',0,'Toolkit Test Sensor',False),
                    (33421,'H',2,(2,2),False),(33422,'B',4,(0,1,1,2),False),
                    (50710,'B',3,(0,1,2),False),(50711,'H',1,1,False),
                    (50717,'I',1,65535,False),(50778,'H',1,21,False),
                    (50721,'2i',9,(1,1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,1,1),False),
                    (50728,'2I',3,(1,1,1,1,1,1),False)]
            tifffile.imwrite(p / 'sensor', pixels, photometric='cfa', metadata=None, extratags=tags)
            convert(p / 'sensor', p / 'out.tiff', 'tiff')
            data = tifffile.imread(p / 'out.tiff')
            self.assertEqual(data.shape, (64, 80, 3))
            self.assertEqual(data.dtype, np.uint16)
            self.assertGreater(data.max(), 0)


if __name__ == '__main__':
    unittest.main()
