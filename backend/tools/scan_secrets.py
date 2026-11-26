"""Scan Git history, the current tree and Angular dist. Print categories/counts only."""
import collections
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
UUID = rb"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
PATTERNS = {
    "app-check-debug": re.compile(rb"(?:FIREBASE_APPCHECK_DEBUG_TOKEN|app.?check.{0,20}debug.{0,20}token|debug.{0,16}token).{0,120}?" + UUID, re.I | re.S),
    "private-key": re.compile(rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----(?:\\[rn]|\s)+[A-Za-z0-9+/=]{30}"),
    "aws-access-id": re.compile(rb"(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "github-token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{55,})"),
    "google-oauth-secret": re.compile(rb"GOCSPX-[A-Za-z0-9_-]{20,}"),
    "google-access-token": re.compile(rb"ya29\.[A-Za-z0-9_.-]{45,}"),
    "jwt-token": re.compile(rb"eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{35,}"),
    "api-secret": re.compile(rb"\b(?:sk-proj-|sk-ant-|sk_live_)[A-Za-z0-9_-]{20,}"),
    "credential-uri": re.compile(rb"(?i)(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?)://[^@\s:/]{2,}:[A-Za-z0-9/+=_-]{12,}@"),
}
def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])

PUBLIC_KEY = re.compile(rb"AIza[0-9A-Za-z_-]{35}")

def scan(scope, files):
    visited = hits = public_identifiers = 0
    counts = collections.Counter()
    for data in files:
        visited += 1
        public_identifiers += int(bool(PUBLIC_KEY.search(data)))
        for category, pattern in PATTERNS.items():
            if pattern.search(data):
                counts[category] += 1
                hits += 1
    print(f"{scope}: examined={visited} matches={hits} categories={dict(counts)}")
    print(f"{scope}: google-web-key candidates={public_identifiers}")
    return hits + public_identifiers

def blobs():
    # The batch protocol avoids embedding file contents in command lines or exceptions.
    objects = git("rev-list", "--objects", "--all", "--no-object-names")
    rows = subprocess.check_output(["git", "-C", str(ROOT), "cat-file", "--batch-check"], input=objects)
    hashes = [r.split()[0] for r in rows.splitlines() if r.split()[1] == b"blob"]
    data = subprocess.check_output(["git", "-C", str(ROOT), "cat-file", "--batch"], input=b"\n".join(hashes)+b"\n")
    pos = 0
    for _ in hashes:
        end = data.index(b"\n", pos)
        size = int(data[pos:end].split()[2])
        yield data[end+1:end+1+size]
        pos = end+size+2

def main():
    tracked = git("ls-files", "-z", "-c", "-o", "--exclude-standard").split(b"\x00")
    paths = [ROOT / p.decode("utf-8") for p in tracked if p]
    failures = scan("working-tree", (p.read_bytes() for p in paths if p.is_file()))
    failures += scan("history/all-refs", blobs())
    dist = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "frontend/ostrixai-web/dist/ostrixai-web/browser"
    if not (dist / "ngsw.json").is_file():
        print("production build unavailable")
        return 2
    failures += scan("production", (p.read_bytes() for p in dist.rglob("*") if p.is_file()))
    return int(failures > 0)

if __name__ == "__main__":
    sys.exit(main())
