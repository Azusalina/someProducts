"""Private local CA and a renewable server certificate for the LAN address."""
import hashlib
import json
import os
import plistlib
import secrets
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path


def data_directory():
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")) / "Track"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "track"


def private_write(path, content):
    path = Path(path)
    # Write under the final file's directory, then atomically replace it.
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".track-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def openssl_program():
    found = shutil.which("openssl")
    if not found and os.name == "nt":
        for folder in (os.environ.get("ProgramFiles", "C:/Program Files"), os.environ.get("LOCALAPPDATA", "")):
            for suffix in ("Git/usr/bin/openssl.exe", "Programs/Git/usr/bin/openssl.exe"):
                path = Path(folder) / suffix
                if path.is_file():
                    return str(path)
    if not found:
        raise RuntimeError("OpenSSL is required. Install OpenSSL (or Git for Windows), then restart Track.")
    return found


def prepare(data_dir, lan_ip):
    folder = Path(data_dir)
    folder.mkdir(parents=True, exist_ok=True)
    try:
        folder.chmod(0o700)
    except OSError:
        pass
    config_path = folder / "config.json"
    if config_path.exists():
        config = json.loads(config_path.read_text(encoding="utf-8"))
    else:
        config = {"token": secrets.token_urlsafe(32), "identity": str(uuid.uuid4())}
        private_write(config_path, json.dumps(config))
    program = openssl_program()

    def run(*args):
        subprocess.run([program, *map(str, args)], check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE)

    ca_key, ca_cert = folder / "ca.key", folder / "ca.pem"
    if ca_key.exists() != ca_cert.exists():
        raise RuntimeError("Incomplete Track CA. Restore ca.key and ca.pem together from backup.")
    if not ca_cert.exists():
        with tempfile.TemporaryDirectory(dir=folder) as tmp:
            key, cert = Path(tmp) / "ca.key", Path(tmp) / "ca.pem"
            run("req", "-x509", "-newkey", "rsa:3072", "-sha256", "-nodes", "-days", "3650",
                "-keyout", key, "-out", cert, "-subj", f"/CN=Track Local CA {config['identity'][:8]}",
                "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
                "-addext", "keyUsage=critical,keyCertSign,cRLSign")
            os.replace(key, ca_key)
            os.replace(cert, ca_cert)
    cert, key = folder / "server.pem", folder / "server.key"
    current_ip = folder / "certificate-ip.txt"
    renew = not cert.exists() or not key.exists() or not current_ip.exists() or current_ip.read_text().strip() != lan_ip
    if not renew:
        renew = subprocess.run([program, "x509", "-checkend", "604800", "-noout", "-in", str(cert)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0
    if renew:
        with tempfile.TemporaryDirectory(dir=folder) as tmp:
            tmp = Path(tmp)
            ext = tmp / "extensions.cnf"
            ext.write_text(f"basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n"
                           f"extendedKeyUsage=serverAuth\nsubjectAltName=IP:{lan_ip},IP:127.0.0.1,DNS:localhost\n")
            run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256", "-keyout", tmp / "key",
                "-out", tmp / "request", "-subj", "/CN=Track Local Receiver")
            run("x509", "-req", "-in", tmp / "request", "-CA", ca_cert, "-CAkey", ca_key,
                "-set_serial", str(secrets.randbits(128)), "-out", tmp / "cert", "-days", "365",
                "-sha256", "-extfile", ext)
            os.replace(tmp / "cert", cert)
            os.replace(tmp / "key", key)
        private_write(current_ip, lan_ip)
    for file in (ca_key, key, config_path):
        try:
            file.chmod(0o600)
        except OSError:
            pass
    pem = ca_cert.read_text()
    import ssl
    der = ssl.PEM_cert_to_DER_cert(pem)
    fingerprint = ":".join(hashlib.sha256(der).hexdigest()[i:i+2].upper() for i in range(0, 64, 2))
    root_id = f"local.track.ca.{config['identity']}"
    profile = plistlib.dumps({
        "PayloadContent": [{"PayloadCertificateFileName": "track-ca.cer", "PayloadContent": der,
                            "PayloadDescription": "Trust this PC's Track HTTPS receiver.",
                            "PayloadDisplayName": f"Track Local CA {config['identity'][:8]}",
                            "PayloadIdentifier": root_id, "PayloadType": "com.apple.security.root",
                            "PayloadUUID": config["identity"], "PayloadVersion": 1}],
        "PayloadDisplayName": "Track Local Sync", "PayloadDescription": "Local certificate only. No MDM, VPN or device management.",
        "PayloadIdentifier": root_id + ".profile", "PayloadType": "Configuration",
        "PayloadUUID": str(uuid.uuid5(uuid.UUID(config["identity"]), "profile")), "PayloadVersion": 1,
        "PayloadRemovalDisallowed": False,
    })
    return {"config": config, "cert": cert, "key": key, "profile": profile, "fingerprint": fingerprint}
