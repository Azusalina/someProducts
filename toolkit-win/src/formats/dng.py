"""DNG import and 16-bit linear-sRGB DNG export; no synthetic Bayer mosaic."""

LIMIT = 32_000_000


def is_dng(source):
    import tifffile
    try:
        with tifffile.TiffFile(source) as image:
            return 50706 in image.pages[0].tags
    except (tifffile.TiffFileError, ValueError):
        return False


def read_dng(source):
    import rawpy
    # Inspect dimensions before LibRaw allocates/unpacks the sensor image.
    with rawpy.RawPy() as raw:
        raw.open_file(str(source))
        if raw.sizes.raw_width * raw.sizes.raw_height > LIMIT:
            raise ValueError('Choose a photo with at most 32 megapixels.')
        raw.unpack()
        return raw.postprocess(output_bps=16, use_camera_wb=True, no_auto_bright=True,
                               output_color=rawpy.ColorSpace.sRGB, gamma=(2.4, 12.92))


def write_dng(output, rgb):
    import numpy as np
    import tifffile
    # Input is rendered sRGB, not sensor data. Decode its transfer function into
    # a linear-light RGB image and identify that color space in the DNG tags.
    rgb = rgb.astype(np.float32) / 65535.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    linear = np.rint(np.clip(linear, 0, 1) * 65535).astype(np.uint16)
    # XYZ D65 -> linear sRGB, with D65 calibration illuminant and neutral white.
    matrix = (3.2404542, -1.5371385, -0.4985314,
              -0.9692660, 1.8760108, 0.0415560,
              0.0556434, -0.2040259, 1.0572252)
    rational = tuple(x for value in matrix for x in (round(value * 10_000_000), 10_000_000))
    h, w = linear.shape[:2]
    tags = [(50706, 'B', 4, (1, 4, 0, 0), False),
            (50707, 'B', 4, (1, 1, 0, 0), False),
            (50708, 's', 0, 'Toolkit Linear sRGB', False),
            (50721, '2i', 9, rational, False),
            (50728, '2I', 3, (1, 1, 1, 1, 1, 1), False),
            (50778, 'H', 1, 21, False),
            (50714, '2I', 1, (0, 1), False),
            (50717, 'I', 1, 65535, False),
            (50719, 'I', 2, (0, 0), False),
            (50720, 'I', 2, (w, h), False),
            (50829, 'I', 4, (0, 0, h, w), False),
            (274, 'H', 1, 1, False)]
    tifffile.imwrite(output, linear, photometric=34892, planarconfig='contig',
                     subfiletype=0, metadata=None, compression=None, extratags=tags)



def high_bit_tiff(source, grayscale=False):
    import tifffile
    import numpy as np
    try:
        image = tifffile.TiffFile(source)
    except (tifffile.TiffFileError, ValueError):
        return None
    with image:
        page = image.pages[0]
        if page.photometric not in ((1, 2) if grayscale else (2,)) or page.dtype != np.dtype('uint16'):
            return None
        if page.imagewidth * page.imagelength > LIMIT:
            raise ValueError('Choose a photo with at most 32 megapixels.')
        data = page.asarray()
        if page.planarconfig == 2:
            data = np.moveaxis(data, 0, -1)
        if data.ndim == 2:
            data = np.repeat(data[:, :, None], 3, axis=2)
        if data.ndim != 3 or data.shape[-1] not in (3, 4):
            raise ValueError('Choose an RGB or RGBA TIFF image.')
        orientation = page.tags.get(274)
        orientation = orientation.value if orientation else 1
        if orientation == 2: data = np.fliplr(data)
        elif orientation == 3: data = np.rot90(data, 2)
        elif orientation == 4: data = np.flipud(data)
        elif orientation == 5: data = data.transpose(1, 0, 2)
        elif orientation == 6: data = np.rot90(data, -1)
        elif orientation == 7: data = data.transpose(1, 0, 2)[::-1, ::-1]
        elif orientation == 8: data = np.rot90(data, 1)
        profile = page.tags.get(34675)
        return data, profile.value if profile else None


def converted_dng(source, output, target):
    """Return True when DNG input or output was handled."""
    import numpy as np
    import tifffile
    from PIL import Image, ImageOps, ImageCms
    dng = is_dng(source)
    high = high_bit_tiff(source, grayscale=target == 'dng') if not dng and target in ('dng', 'tiff') else None
    if not dng and target != 'dng' and high is None:
        return False
    if high is not None:
        rgb, profile = high
        if target == 'tiff':
            tifffile.imwrite(output, rgb, photometric='rgb', metadata=None, compression='deflate', iccprofile=profile)
            return True
        if profile:
            import io
            if 'srgb' not in ImageCms.getProfileName(ImageCms.ImageCmsProfile(io.BytesIO(profile))).lower():
                raise ValueError('Convert a 16-bit TIFF to sRGB before exporting linear DNG.')
        if rgb.shape[-1] == 4:
            alpha = rgb[:, :, 3:4].astype(np.float32) / 65535
            rgb = np.rint(rgb[:, :, :3] * alpha + 65535 * (1 - alpha)).astype(np.uint16)
    elif dng:
        rgb = read_dng(source)
    else:
        with Image.open(source, formats=['JPEG', 'PNG', 'WEBP', 'AVIF', 'BMP', 'TIFF', 'GIF']) as original:
            if original.width * original.height > LIMIT:
                raise ValueError('Choose a photo with at most 32 megapixels.')
            image = ImageOps.exif_transpose(original)
            image.load()
            # DNG has no general-purpose transparency channel; flatten onto white.
            if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
                image = image.convert('RGBA')
                background = Image.new('RGBA', image.size, 'white')
                image = Image.alpha_composite(background, image).convert('RGB')
            else:
                image = image.convert('RGB')
            if original.info.get('icc_profile'):
                import io
                image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(original.info['icc_profile'])), ImageCms.createProfile('sRGB'), outputMode='RGB')
            rgb = np.asarray(image).astype(np.uint16) * 257
    if target == 'dng':
        write_dng(output, rgb)
    elif target == 'tiff':
        # Keep all 16 bits from the RAW demosaic, with a real sRGB profile.
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        tifffile.imwrite(output, rgb, photometric='rgb', metadata=None,
                         compression='deflate', iccprofile=profile)
    else:
        image = Image.fromarray(((rgb.astype(np.uint32) + 128) // 257).astype(np.uint8))
        options = {'icc_profile': ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()}
        if target == 'jpg': options.update(quality=95, subsampling=0)
        elif target == 'webp': options.update(quality=95, method=4)
        elif target == 'avif': options.update(quality=90, speed=6)
        image.save(output, {'jpg': 'JPEG', 'png': 'PNG', 'webp': 'WEBP', 'avif': 'AVIF'}[target], **options)
    return True
