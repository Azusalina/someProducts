"""Local raster image conversion. The caller supplies application-owned paths."""
from pathlib import Path
import socket
import sys


def convert(source, output, target):
    def offline(*_args, **_kwargs):
        raise RuntimeError('Photo conversion does not use the network.')
    socket.socket.connect = offline
    socket.socket.connect_ex = offline
    from PIL import Image, ImageOps
    outputs = {'jpg': 'JPEG', 'png': 'PNG', 'webp': 'WEBP', 'avif': 'AVIF', 'tiff': 'TIFF', 'dng': 'DNG'}
    if target not in outputs:
        raise ValueError('Choose a supported photo output format.')
    Image.MAX_IMAGE_PIXELS = 32_000_000
    from dng import converted_dng
    if converted_dng(source, output, target):
        return
    with Image.open(source, formats=['JPEG', 'PNG', 'WEBP', 'AVIF', 'BMP', 'TIFF', 'GIF']) as original:
        if original.width * original.height > 32_000_000:
            raise ValueError('Choose a photo with at most 32 megapixels.')
        original.seek(0)
        image = ImageOps.exif_transpose(original)
        image.load()
        exif = image.getexif()
        alpha = image.mode in ('RGBA', 'LA') or 'transparency' in image.info
        if target != 'tiff':
            image = image.convert('RGBA' if alpha else 'RGB')
        if target == 'jpg' and alpha:
            opaque = Image.new('RGB', image.size, 'white')
            opaque.paste(image, mask=image.getchannel('A'))
            image = opaque
        options = {}
        if original.mode in ('RGB', 'RGBA') and original.info.get('icc_profile'):
            options['icc_profile'] = original.info['icc_profile']
        # Transposition removes the orientation tag while retaining other EXIF.
        if exif:
            options['exif'] = exif.tobytes()
        if target == 'jpg': options.update(quality=95, subsampling=0)
        elif target == 'webp': options.update(quality=95, method=4)
        elif target == 'avif': options.update(quality=90, speed=6)
        elif target == 'tiff': options.update(compression='tiff_deflate')
        image.save(output, outputs[target], **options)

if __name__ == '__main__':
    try:
        convert(*sys.argv[1:])
    except ModuleNotFoundError:
        print('Photo converter missing. Run npm run formats:setup.', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
