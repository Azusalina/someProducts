"""Download an isolated OMR runtime and attributed piano samples. No system install."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = "5.11.0"
DEB_URL = f"https://github.com/Audiveris/audiveris/releases/download/{VERSION}/Audiveris-{VERSION}-ubuntu24.04-x86_64.deb"
DEB_SHA = "f20113aaa33b3149ec8d6a09b2a7963360e65fafd92d69389987a85bbc3ec7a3"


def download(url, target, digest=None):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and (not digest or hashlib.sha256(target.read_bytes()).hexdigest() == digest):
        return
    temp = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "sheetVis-local-setup"})
    with urllib.request.urlopen(request, timeout=120) as response, temp.open("wb") as dest:
        shutil.copyfileobj(response, dest)
    if digest and hashlib.sha256(temp.read_bytes()).hexdigest() != digest:
        temp.unlink()
        raise RuntimeError(f"SHA256 mismatch: {target.name}")
    os.replace(temp, target)


def main():
    if os.uname().machine != "x86_64":
        raise SystemExit("Bundled Audiveris runtime currently requires Linux x86_64.")
    runtime = ROOT / ".runtime"
    deb = runtime / "audiveris.deb"
    print("Downloading Audiveris 5.11.0 (about 78 MB)…", flush=True)
    download(DEB_URL, deb, DEB_SHA)
    engine = runtime / "audiveris"
    if not (engine / "opt/audiveris/bin/Audiveris").exists():
        engine.mkdir(parents=True, exist_ok=True)
        members = subprocess.check_output(["ar", "t", str(deb)], text=True).splitlines()
        member = next(name for name in members if name.startswith("data.tar"))
        archive = runtime / member
        with archive.open("wb") as dest:
            subprocess.run(["ar", "p", str(deb), member], stdout=dest, check=True)
        with tarfile.open(archive) as package:
            package.extractall(engine, filter="data")
        archive.unlink()
    # Pin the sample repository commit once; reuse it on all subsequent setup runs.
    manifest_path = ROOT / "public/samples/manifest.json"
    if manifest_path.exists():
        commit = json.loads(manifest_path.read_text())["commit"]
    else:
        request = urllib.request.Request("https://api.github.com/repos/nbrosowsky/tonejs-instruments/commits/master", headers={"User-Agent": "sheetVis-local-setup"})
        with urllib.request.urlopen(request, timeout=30) as response:
            commit = json.load(response)["sha"]
    base = f"https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/{commit}"
    names = [f"{note}{octave}" for octave in range(1, 8) for note in ["C", "D#", "F#", "A"]]
    names += ["C8"]
    print("Downloading local piano samples…", flush=True)
    def sample(name):
        # Piano sample names use 's' instead of '#' in this repository.
        file = name.replace("#", "s") + ".mp3"
        download(f"{base}/samples/piano/{file}", ROOT / "public/samples" / file)
        return {"note": name, "file": file, "sha256": hashlib.sha256((ROOT / "public/samples" / file).read_bytes()).hexdigest()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        samples = list(pool.map(sample, names))
    for name in ["LICENSE.md", "sample-source-info.txt"]:
        download(f"{base}/{name}", ROOT / "public/samples" / name)
    manifest_path.write_text(json.dumps({"commit": commit, "source": "https://github.com/nbrosowsky/tonejs-instruments", "license": "CC-BY-3.0", "samples": samples}, indent=2))
    (runtime / "provenance.json").write_text(json.dumps({"version": VERSION, "url": DEB_URL, "sha256": DEB_SHA}, indent=2))
    print("Preparing offline text-recognition language data…", flush=True)
    tess_manifest = runtime / "tessdata/provenance.json"
    tess_source = "https://github.com/tesseract-ocr/tessdata"
    previous = json.loads(tess_manifest.read_text()) if tess_manifest.exists() else {}
    if previous.get("source") == tess_source:
        tess_commit = previous["commit"]
    else:
        # Audiveris 5.11 uses legacy OCR; tessdata_fast / best are LSTM-only.
        (runtime / "tessdata/eng.traineddata").unlink(missing_ok=True)
        req = urllib.request.Request("https://api.github.com/repos/tesseract-ocr/tessdata/commits/main", headers={"User-Agent": "sheetVis-local-setup"})
        with urllib.request.urlopen(req, timeout=30) as response:
            tess_commit = json.load(response)["sha"]
    tess_base = f"https://raw.githubusercontent.com/tesseract-ocr/tessdata/{tess_commit}"
    download(f"{tess_base}/eng.traineddata", runtime / "tessdata/eng.traineddata")
    download(f"{tess_base}/LICENSE", ROOT / "public/licenses/tessdata.txt")
    (ROOT / "public/licenses/tessdata-fast.txt").unlink(missing_ok=True)
    tess_manifest.write_text(json.dumps({"commit": tess_commit, "source": tess_source, "sha256": hashlib.sha256((runtime / "tessdata/eng.traineddata").read_bytes()).hexdigest()}, indent=2))
    print("Local resources ready. Run npm run build, then npm start.", flush=True)


if __name__ == "__main__":
    main()
