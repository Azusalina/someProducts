"""Noninteractive adapter for the user's separate scribd-downloader checkout."""
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile


def event(kind, **data):
    print(json.dumps({'type': kind, **data}), flush=True)


def export_document(source_url, output, repository, fixture=None):
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.support.ui import WebDriverWait
    from pypdf import PdfReader
    spec = importlib.util.spec_from_file_location('toolkit_scribd_exporter', repository / 'scribd-downloader.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def progress(*items, **_kwargs):
        line = ' '.join(map(str, items)).strip()
        if re.match(r'(Exporting \d+|Loading page batch |Page \d+/|Merging \d+)', line):
            event('progress', message=line[:240])
    module.print = progress
    driver = None
    with tempfile.TemporaryDirectory(prefix='chrome-profile-', dir=output.parent) as profile:
        try:
            options = module.build_chrome_options(profile)
            # Keep Chromium's normal sandbox enabled. Use fresh temporary state;
            # neither existing profiles nor Scribd credentials are read.
            if '--no-sandbox' in options.arguments:
                options.arguments.remove('--no-sandbox')
            import shutil
            browser = os.environ.get('TOOLKIT_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome')
            if browser:
                options.binary_location = browser
            executable = os.environ.get('TOOLKIT_CHROMEDRIVER') or shutil.which('chromedriver')
            if not executable:
                raise RuntimeError('Install matching ChromeDriver on PATH, or set TOOLKIT_CHROMEDRIVER to chromedriver.exe.')
            service = Service(executable_path=executable)
            driver = webdriver.Chrome(service=service, options=options)
            driver.set_page_load_timeout(60)
            event('progress', message='Loading Scribd document…')
            if fixture:
                # Used only by local tests; this parameter is never accepted by HTTP.
                driver.get(Path(fixture).resolve().as_uri())
            else:
                document_id = re.fullmatch(r'https://www\.scribd\.com/(?:document|doc)/(\d+)(?:/[^?#]*)?', source_url).group(1)
                driver.get(f'https://www.scribd.com/embeds/{document_id}/content')
            try:
                WebDriverWait(driver, 25).until(lambda d: d.execute_script("return document.querySelectorAll('.outer_page').length > 0"))
            except Exception:
                title = driver.title[:80]
                raise RuntimeError(f'Scribd did not provide printable pages ({title}). The document may be restricted, unavailable, or blocked by browser verification.') from None
            total = driver.execute_script("return document.querySelectorAll('.outer_page').length")
            if not 0 < total <= 500:
                raise RuntimeError('Choose a document with 1–500 pages.')
            module.hide_cookie_dialogs(driver)
            module.prepare_document_for_print(driver)
            module.inject_print_styles(driver)
            module.save_pdf_pages_individually(driver, str(output), timeout_seconds=120)
            reader = PdfReader(str(output))
            if len(reader.pages) != total:
                raise RuntimeError(f'Incomplete PDF: expected {total} pages, received {len(reader.pages)}.')
            if output.stat().st_size > 100 * 1024 * 1024:
                raise RuntimeError('PDF exceeds the 100 MB output limit.')
            event('complete', pages=total)
        finally:
            if driver:
                driver.quit()


def main():
    options = json.load(sys.stdin)
    source_url = options['url']
    if not re.fullmatch(r'https://www\.scribd\.com/(?:document|doc)/\d+(?:/[^?#]*)?', source_url):
        raise ValueError('Enter a valid Scribd document address.')
    export_document(source_url, Path(options['output']), Path(options['repository']))


if __name__ == '__main__':
    try:
        main()
    except ModuleNotFoundError:
        event('error', message='Install Scribd support with npm run scribd:setup.')
        sys.exit(1)
    except Exception as error:
        event('error', message=str(error)[:700])
        sys.exit(1)
