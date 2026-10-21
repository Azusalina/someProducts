"""PDF-only, offline MarkItDown conversion of an application-owned file."""
import json
from pathlib import Path
import socket
import sys


def no_network(*_args, **_kwargs):
    raise RuntimeError('Network access is disabled for local PDF conversion.')


def convert(filename):
    socket.socket.connect = no_network
    socket.socket.connect_ex = no_network
    socket.create_connection = no_network
    from importlib.metadata import version
    from markitdown import MarkItDown
    from markitdown.converters import PdfConverter
    path = Path(filename)
    with path.open('rb') as stream:
        if b'%PDF-' not in stream.read(1024):
            raise ValueError('Choose a valid PDF file.')
    converter = MarkItDown(enable_builtins=False, enable_plugins=False)
    converter.register_converter(PdfConverter())
    result = converter.convert_local(path)
    markdown = result.markdown.strip()
    if not markdown:
        raise ValueError('No selectable text was found. Image-only/scanned PDFs need OCR; this converter does not run OCR.')
    if len(markdown.encode('utf-8')) > 5 * 1024 * 1024:
        raise ValueError('Converted Markdown exceeds the 5 MB limit.')
    return {'markdown': markdown + '\n', 'converter': 'MarkItDown', 'version': version('markitdown')}

if __name__ == '__main__':
    try:
        print(json.dumps(convert(sys.argv[1]), ensure_ascii=False))
    except ModuleNotFoundError:
        print('MarkItDown is missing. Run npm run pdfmd:setup.', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print('Password-protected PDFs are not supported. Use an unlocked copy.' if type(error).__name__ == 'PDFPasswordIncorrect' else str(error), file=sys.stderr)
        sys.exit(1)
