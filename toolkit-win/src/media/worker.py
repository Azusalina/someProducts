"""Public HTTP(S) media discovery/download; JSON stdin and stdout only."""
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
from urllib.parse import urlparse
from urllib.parse import urljoin, unquote
from html.parser import HTMLParser
from urllib.request import urlopen, Request
import zipfile

LIMIT = 250 * 1024 * 1024


def validate_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Use a public HTTP(S) URL without embedded login credentials.')
    if len(url) > 4096:
        raise ValueError('URL is too long.')
    return url


def install_network_guard():
    # Validate the actual destination at connect time, including redirected and
    # extracted URLs. This also prevents DNS rebinding into the local network.
    connect, connect_ex = socket.socket.connect, socket.socket.connect_ex

    def check(address):
        if not isinstance(address, tuple):
            raise ValueError('Only public internet connections are supported.')
        ip = ipaddress.ip_address(address[0].split('%')[0])
        if not ip.is_global or (ip.version == 6 and ip.ipv4_mapped and not ip.ipv4_mapped.is_global):
            raise ValueError('Local and private network media URLs are not supported.')

    def guarded(self, address):
        check(address)
        return connect(self, address)

    def guarded_ex(self, address):
        check(address)
        return connect_ex(self, address)

    socket.socket.connect, socket.socket.connect_ex = guarded, guarded_ex


class Logger:
    def debug(self, _message): pass
    def warning(self, _message): pass
    def error(self, message): print(message, file=sys.stderr)


def html_media_links(url):
    class Links(HTMLParser):
        def __init__(self):
            super().__init__(); self.items = []; self.seen = set()

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            value = attrs.get('href') if tag == 'a' else attrs.get('src') if tag in ('audio', 'video', 'source') else None
            if not value or len(self.items) >= 100:
                return
            target = urljoin(url, value)
            ext = Path(urlparse(target).path).suffix.lower()
            if ext not in ('.mp3','.m4a','.aac','.wav','.flac','.ogg','.opus','.mp4','.webm','.mov','.mkv','.m3u8') or target in self.seen:
                return
            validate_url(target); self.seen.add(target)
            title = attrs.get('title') or attrs.get('aria-label') or unquote(Path(urlparse(target).path).name)
            self.items.append(dict(url=target, title=title[:300], kind='audio' if ext in ('.mp3','.m4a','.aac','.wav','.flac','.ogg','.opus') else 'video / media', duration=None, headers={'Referer':url}))

    with urlopen(Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=20) as response:
        if 'html' not in response.headers.get('Content-Type', ''):
            return []
        url = validate_url(response.geturl())
        content = response.read(2 * 1024 * 1024 + 1)
        if len(content) > 2 * 1024 * 1024:
            raise ValueError('HTML page exceeds the 2 MB scan limit.')
        parser = Links(); parser.feed(content.decode('utf-8', errors='replace'))
        return parser.items


def options():
    return dict(quiet=True, no_warnings=True, logger=Logger(), cachedir=False,
                socket_timeout=20, ffmpeg_location=os.environ.get('TOOLKIT_FFMPEG'), retries=1, fragment_retries=1, playlistend=100,
                max_filesize=LIMIT, hls_prefer_native=True,
                postprocessor_args={'ExtractAudio+ffmpeg_i': ['-protocol_whitelist', 'file,pipe']})


def scan(url):
    import yt_dlp
    opts = options() | dict(extract_flat='in_playlist', skip_download=True)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            result = ydl.extract_info(validate_url(url), download=False)
    except Exception:
        fallback = html_media_links(validate_url(url))
        if fallback:
            return fallback
        raise
    if not result:
        raise ValueError('No accessible media was found.')
    rows = list(result.get('entries') or [result])[:100]
    output = []
    for row in rows:
        if not row:
            continue
        target = row.get('webpage_url') or row.get('url')
        # Generic HTML entries can share the parent webpage URL. Use each
        # embedded resource in that case, rather than downloading the whole
        # parent playlist again for every selected item.
        if result.get('entries') and row.get('webpage_url') == url and row.get('_type') not in ('url', 'url_transparent'):
            candidates = [f for f in row.get('formats', []) if f.get('url') and f.get('acodec') != 'none']
            audio = [f for f in candidates if f.get('vcodec') == 'none']
            candidates = audio or candidates
            target = row.get('url') or (candidates[-1]['url'] if candidates else target)
        if not target or not target.startswith(('https://', 'http://')):
            continue
        formats = row.get('formats') or []
        audio_only = row.get('vcodec') == 'none' or (formats and all(f.get('vcodec') == 'none' for f in formats))
        ext = str(row.get('ext', '')).lower()
        kind = 'audio' if audio_only or ext in ('mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus') else 'video / media'
        headers = {k: v for k, v in row.get('http_headers', {}).items() if k.lower() in ('referer', 'user-agent')}
        output.append(dict(url=validate_url(target), title=str(row.get('title') or row.get('id') or 'Untitled')[:300],
                           kind=kind, duration=row.get('duration'), headers=headers))
    if str(result.get('extractor_key', '')).lower() == 'generic':
        try:
            known = {row['url'] for row in output}
            output += [row for row in html_media_links(url) if row['url'] not in known][:100-len(output)]
        except Exception:
            pass  # The extractor's successful results remain usable.
    if not output:
        raise ValueError('No accessible audio or video was found at this URL.')
    return output


def download(entries, mode, folder):
    import yt_dlp
    from yt_dlp.utils import sanitize_filename
    if mode not in ('mp3', 'flac', 'original'):
        raise ValueError('Choose MP3, FLAC or original audio.')
    outputs = []
    for index, entry in enumerate(entries, 1):
        prefix = f'{index:02d}-'
        opts = options() | dict(noplaylist=True,
            format='/'.join(f'{quality}[protocol={protocol}]' for quality in ('bestaudio', 'best')
                            for protocol in ('https', 'http', 'http_dash_segments', 'm3u8_native')),
            http_headers=entry.get('headers') or {},
            outtmpl=str(folder / (prefix + sanitize_filename(entry['title'])[:100].replace('%', '%%') + '.%(ext)s')),
            postprocessors=[dict(key='FFmpegExtractAudio', preferredcodec='best' if mode == 'original' else mode,
                                 preferredquality='0')])
        def progress(data):
            if data.get('downloaded_bytes', 0) > LIMIT:
                raise ValueError('Media exceeds the 250 MB download limit.')
        opts['progress_hooks'] = [progress]
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(validate_url(entry['url']), download=True)
        if not info:
            raise ValueError(f'Could not download item {index}.')
        files = [p for p in folder.iterdir() if p.name.startswith(prefix) and p.suffix not in ('.part', '.ytdl')]
        if len(files) != 1:
            raise ValueError(f'Audio extraction did not finish for item {index}.')
        outputs.append(files[0])
    if len(outputs) == 1:
        return outputs[0].name
    archive = folder / 'selected-audio.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as zipped:
        for file in outputs:
            zipped.write(file, file.name)
    return archive.name


def main():
    data = json.load(sys.stdin)
    install_network_guard()
    if data['action'] == 'scan':
        print(json.dumps(scan(data['url'])))
    elif data['action'] == 'download':
        print(json.dumps(dict(filename=download(data['entries'], data['format'], Path(data['folder'])))))
    else:
        raise ValueError('Unknown media operation.')

if __name__ == '__main__':
    try:
        main()
    except ModuleNotFoundError:
        print('Media dependency missing. Run npm run media:setup.', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
