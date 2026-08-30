#!/usr/bin/env python3
"""Isi HQ dari apa yang bisa dilihat sendiri: folder project, remote git,
container yang jalan, dan site nginx di server.

Cuma nambah, tidak pernah menimpa. Yang sudah ada di HQ dilewati, jadi aman
dijalankan berkali-kali. Token di dalam URL remote dibuang sebelum dikirim.

    python3 scripts/scan.py --dry-run
    python3 scripts/scan.py --server my-server

Password ditanya lewat prompt; kalau mau tanpa prompt, isi HQ_PASSWORD.
"""
import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Folder yang bukan project.
SKIP = {
    "archive", "learn", "src", "test", "ssl", "vercel", "node_modules",
    "__pycache__", "venv", ".venv",
}

SECRET_PATTERN = re.compile(r"(ghp_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{10,}")

# Sebuah folder dianggap project kalau ada salah satu penanda ini di dalamnya.
# Tanpa aturan ini scanner ikut masuk ke cmd/, data/, dan folder backup.
MARKERS = (
    ".git", "go.mod", "package.json", "requirements.txt", "composer.json",
    "pyproject.toml", "Gemfile", "Cargo.toml", "docker-compose.yml",
    "docker-compose.yaml", "Dockerfile", "manage.py", "index.html",
    "odoo.conf", "next.config.js", "next.config.ts", "vite.config.ts",
)

KIND_HINTS = (
    ("odoo", ("odoo", "addons", "frappe")),
    ("infra", ("infra", "ansible", "deploy")),
    ("website", ("website", "site", "landing", "company-profile", "portfolio")),
    ("webapp", ("app", "platform", "portal", "backend", "api")),
)


class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + "/api" + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                raw = res.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:200]
            raise SystemExit("%s %s -> %s %s" % (method, path, e.code, detail))

    def login(self, email, password):
        self.token = self.call("POST", "/auth/login", {"email": email, "password": password})["token"]


def run(args, timeout=40):
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return out.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def strip_credentials(url):
    """https://TOKEN@host/path -> https://host/path"""
    return re.sub(r"(https?://)[^/@]*@", r"\1", url or "")


# Cukup buat domain yang dipakai di sini; bukan public suffix list lengkap.
SECOND_LEVEL = {"co", "or", "ac", "go", "net", "sch", "web", "my", "biz",
                "com", "org", "gov", "edu", "mil"}


def registrable(host):
    """app.example.co.id -> example.co.id. Yang dibayar dan diperpanjang itu
    induknya; subdomain ikut gratis, jadi dia bukan aset sendiri."""
    parts = host.lower().strip(".").split(".")
    if len(parts) <= 2:
        return ".".join(parts)
    if len(parts[-1]) == 2 and parts[-2] in SECOND_LEVEL:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def guess_kind(name, path):
    lowered = name.lower()
    for kind, needles in KIND_HINTS:
        if any(n in lowered for n in needles):
            return kind
    if (path / "package.json").exists() or (path / "requirements.txt").exists():
        return "webapp"
    return "other"


def git_remote(path):
    if not (path / ".git").exists():
        return ""
    return strip_credentials(run(["git", "-C", str(path), "remote", "get-url", "origin"]))


def is_project(path):
    return any((path / marker).exists() for marker in MARKERS)


def usable(entry):
    return entry.is_dir() and not entry.name.startswith(".") and entry.name not in SKIP


def entry_for(path, client):
    return {
        "name": path.name,
        "path": str(path),
        "remote": git_remote(path),
        "kind": guess_kind(path.name, path),
        "client": client,
    }


def scan_folders(roots, depth):
    """Folder dengan penanda project diambil apa adanya dan tidak ditelusuri
    lebih dalam. Folder tanpa penanda cuma ditelusuri kalau isinya memang
    project — itu yang membedakan wadah seperti `clients/` dari `data/`."""
    found = []
    for root in roots:
        root = Path(root).expanduser()
        if not root.is_dir():
            print("lewat: %s bukan folder" % root, file=sys.stderr)
            continue

        for entry in sorted(root.iterdir()):
            if not usable(entry):
                continue

            if is_project(entry):
                found.append(entry_for(entry, ""))
                continue

            if depth < 2:
                continue

            try:
                kids = [c for c in sorted(entry.iterdir()) if usable(c)]
            except PermissionError:
                kids = []

            # A child counts as a project either on its own, or because its own
            # code sits one level further down (app/web, app/api).
            children = [c for c in kids if is_project(c) or has_project_child(c)]

            for child in children:
                found.append(entry_for(child, entry.name))
            if not children:
                print("  lewat %s: bukan project dan isinya juga bukan" % entry.name,
                      file=sys.stderr)
    return found


def has_project_child(path):
    try:
        return any(is_project(c) for c in path.iterdir() if usable(c))
    except (PermissionError, OSError):
        return False


def scan_server(host, deploy_dir):
    containers = {}
    raw = run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host,
               'docker ps --format "{{.Names}}\t{{.Image}}"'])
    for line in raw.splitlines():
        if "\t" in line:
            name, image = line.split("\t", 1)
            containers[name.strip()] = image.strip()

    sites = run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host,
                 "ls %s/services/nginx/sites 2>/dev/null" % deploy_dir]).split()
    # Beberapa file nginx dinamai tanpa TLD (jtb-odoo.conf) — itu server_name
    # internal, bukan domain yang diperpanjang tiap tahun.
    domains = sorted({s[:-5] for s in sites if s.endswith(".conf") and "." in s[:-5]})
    return containers, domains


def match_project(name, projects):
    """Cocokkan nama domain/container ke project. Konservatif: harus salah satu
    memuat yang lain, bukan sekadar mirip."""
    stem = name.split(".")[0].replace("-website", "").replace("-web", "")
    best = None
    for p in projects:
        key = p["slug"]
        if key == stem or stem in key or key in stem:
            if best is None or len(p["slug"]) > len(best["slug"]):
                best = p
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("HQ_BASE", "http://localhost:8080"))
    ap.add_argument("--email", default=os.environ.get("HQ_EMAIL", ""))
    ap.add_argument("--root", action="append", default=None)
    ap.add_argument("--depth", type=int, default=2)
    ap.add_argument("--server", default="")
    ap.add_argument("--deploy-dir", default="/opt/infra")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    roots = args.root or [str(Path.home() / "projects")]
    folders = scan_folders(roots, args.depth)
    print("ketemu %d folder project" % len(folders))

    containers, domains = ({}, [])
    if args.server:
        containers, domains = scan_server(args.server, args.deploy_dir)
        print("di server: %d container, %d domain nginx" % (len(containers), len(domains)))

    if args.dry_run:
        for f in folders:
            print("  %-26s %-9s %-12s %s" %
                  (f["name"], f["kind"], f["client"] or "-", f["remote"] or "-"))
        for d in domains:
            print("  domain: %s" % d)
        for c in sorted(containers):
            print("  container: %s" % c)
        return 0

    password = os.environ.get("HQ_PASSWORD") or getpass.getpass("Password HQ untuk %s: " % args.email)
    api = Api(args.base)
    api.login(args.email, password)
    del password

    existing = {p["slug"]: p for p in api.call("GET", "/projects")["projects"]}
    clients = {c["name"].lower(): c for c in api.call("GET", "/clients")["clients"]}
    assets = {a["name"].lower(): a for a in api.call("GET", "/assets")["assets"]}

    made_projects = made_clients = made_assets = made_links = 0

    # Klien dulu, supaya project bisa langsung nunjuk ke id-nya.
    for f in folders:
        name = f["client"]
        if name and name.lower() not in clients:
            client = api.call("POST", "/clients",
                              {"name": name, "company": "", "status": "active", "notes": ""})
            clients[name.lower()] = client
            made_clients += 1
            print("  + klien %s" % name)

    for f in folders:
        slug = re.sub(r"[^a-z0-9]+", "-", f["name"].lower()).strip("-")
        if slug in existing:
            continue
        client = clients.get(f["client"].lower()) if f["client"] else None
        project = api.call("POST", "/projects", {
            "name": f["name"],
            "client_id": client["id"] if client else None,
            "status": "active", "kind": f["kind"], "summary": "",
            "local_path": f["path"], "deploy_target": "", "notes": "",
        })
        existing[project["slug"]] = project
        made_projects += 1
        print("  + project %s" % project["name"])

        if f["remote"] and not SECRET_PATTERN.search(f["remote"]):
            api.call("POST", "/projects/%s/links" % project["slug"],
                     {"label": "origin", "url": f["remote"], "category": "repo", "notes": ""})
            made_links += 1
        elif f["remote"]:
            print("    ! remote dilewati, ada pola token di dalamnya")

    project_list = list(existing.values())

    if args.server:
        vps_name = "VPS %s" % args.server
        if vps_name.lower() not in assets:
            asset = api.call("POST", "/assets", {
                "name": vps_name, "kind": "vps", "provider": "", "identifier": args.server,
                "status": "active", "cost_amount": 0, "cost_currency": "IDR",
                "billing_cycle": "monthly", "renews_on": "", "auto_renew": False,
                "notes": "Dibuat otomatis oleh scan.py. Isi biaya dan tanggalnya sendiri.",
            })
            assets[vps_name.lower()] = asset
            made_assets += 1
            print("  + aset %s" % vps_name)
        vps = assets[vps_name.lower()]

        for container in sorted(containers):
            hit = match_project(container, project_list)
            if hit:
                api.call("POST", "/projects/%s/assets" % hit["slug"],
                         {"asset_id": vps["id"], "role": container})
                print("    %s -> project %s (peran %s)" % (vps_name, hit["name"], container))

        for domain in domains:
            root = registrable(domain)
            if root not in assets:
                asset = api.call("POST", "/assets", {
                    "name": root, "kind": "domain", "provider": "", "identifier": root,
                    "status": "active", "cost_amount": 0, "cost_currency": "IDR",
                    "billing_cycle": "yearly", "renews_on": "", "auto_renew": False,
                    "notes": "Dibaca dari site nginx. Isi penyedia dan tanggal perpanjangannya.",
                })
                assets[root] = asset
                made_assets += 1
                print("  + aset domain %s" % root)
            asset = assets[root]

            hit = match_project(domain, project_list)
            if hit:
                # Peran diisi nama lengkapnya, jadi kelihatan subdomain mana
                # yang dipakai project ini tanpa bikin aset terpisah.
                api.call("POST", "/projects/%s/assets" % hit["slug"],
                         {"asset_id": asset["id"], "role": domain})
                api.call("POST", "/projects/%s/links" % hit["slug"],
                         {"label": domain, "url": "https://" + domain,
                          "category": "production", "notes": ""})
                made_links += 1
                print("    %s -> project %s (lewat %s)" % (domain, hit["name"], root))

    print("\nselesai: %d project, %d klien, %d aset, %d link" %
          (made_projects, made_clients, made_assets, made_links))
    print("Yang ditebak scanner belum tentu benar — cek dan koreksi di HQ.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
