# HQ

Personal management tooling — a Go JSON API with a React front-end baked
into the binary.

<details open>
<summary><b>English</b></summary>

Personal management tooling. The first module is a list of projects with their
links and credentials. A Go backend that only speaks JSON, and a React
front-end compiled to static files and embedded in the binary — so a deploy is
one file, and a phone app later would eat exactly the same API.

## Layout

    cmd/hq              entry point, plus the genkey and passwd subcommands
    internal/config     reads the environment, fails loudly when something is missing
    internal/secret     AES-256-GCM for credential bodies
    internal/store      every SQL statement lives here and nowhere else
    internal/api        HTTP handlers, all of them under /api
    internal/web        serves the React bundle from inside the binary
    frontend            React 19 + Vite + TypeScript

## Running locally

Needs Postgres. The easiest one is already in the compose file:

```bash
cp .env.example .env
go run ./cmd/hq genkey   # run it twice, once for SESSION and once for ENCRYPTION
```

Fill in `.env`, then:

```bash
docker compose up -d postgres
cd frontend && npm install && npm run build && cd ..
go run ./cmd/hq
```

Open http://localhost:8080.

While working on the interface, run both so you get hot reload: `go run
./cmd/hq` in one terminal, `npm run dev` in another, then open
http://localhost:5173 — Vite proxies `/api` through to Go.

## The encryption key

`HQ_ENCRYPTION_KEY` is what opens stored credentials. Lose it and every secret
in the database goes with it; there is no recovery. Keep a copy wherever your
other vault credentials live, not only in `.env`.

`HQ_SESSION_KEY` only signs session cookies — changing it signs everyone out
and loses no data.

## Commands

```bash
go run ./cmd/hq genkey                  # print one base64 32-byte key
go run ./cmd/hq passwd EMAIL PASSWORD   # create or reset the account
go run ./cmd/hq passkeys-reset EMAIL    # drop every registered device
```

The first account is created from `HQ_OWNER_EMAIL` and `HQ_OWNER_PASSWORD`, but
only while the `users` table is empty — so those variables can stay in the
environment without resetting the password on every restart.

`passkeys-reset` is the way back in when every registered device is gone: run
it on the server, sign in with the password alone, then enrol a new device.

## Signing in

The password is the first step. Once at least one passkey is registered it
becomes the first of two, and the second is a fingerprint or face check on a
device you have enrolled. With no passkey registered the password alone still
works, so nobody can be locked out by never enrolling anything.

Devices are managed under **security**. Three ways to add one: this device,
a phone over the browser's cross-device QR, or a one-time link valid for ten
minutes for a device that is nowhere nearby.

## Filling it automatically

`scripts/scan.py` reads a projects folder, its git remotes, and — when given
`--server` — the running containers and nginx sites there, and registers them
in HQ. It only ever adds, never overwrites, so running it twice is safe. Tokens
embedded in remote URLs are stripped before anything is sent.

```bash
python3 scripts/scan.py --dry-run --server my-server   # look first
python3 scripts/scan.py --server my-server             # then send
```

What the scanner guesses — project kind, client, which asset belongs to which
project — is not always right. Check it in HQ afterwards.

## Talking to it from Claude

`POST /api/mcp` is an MCP server: it lists the tools an assistant may call and
then runs them. Every tool is read-only and credentials are not exposed at all,
so the worst a confused model can do is tell you something you already own.

Set `HQ_MCP_TOKEN` to a long random string. Empty leaves the endpoint closed
rather than open with a token somebody could guess.

```bash
claude mcp add --transport http hq https://hq.example/api/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

Or in `.mcp.json`, the same file Claude Desktop reads:

```json
{
  "mcpServers": {
    "hq": {
      "type": "http",
      "url": "https://hq.example/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

The phone app cannot carry a bearer token. Adding it there means registering a
custom connector, which wants OAuth instead.

## Deploying

```bash
docker compose up -d --build
```

The container listens on `127.0.0.1:8080`; nginx in front of it holds the TLS.
Memory limits are set in the compose file: 96 MB for the app, 192 MB for
Postgres.

Set `HQ_RP_ID` and `HQ_ORIGIN` to the host it is served from. WebAuthn is bound
to exactly one origin and the browser refuses any other, so the defaults
(`localhost`) are for local runs only.

</details>

<details>
<summary><b>Bahasa Indonesia</b></summary>

Alat manajemen pribadi. Modul pertama: daftar project beserta link dan
credential-nya. Backend Go yang cuma ngeluarin JSON, front-end React yang
di-build jadi file statis dan ditempel ke dalam binary — jadi yang di-deploy
satu file, dan kalau nanti ada app HP, dia makan API yang sama persis.

## Bentuknya

    cmd/hq              entry point, plus subcommand genkey dan passwd
    internal/config     baca environment, gagal keras kalau ada yang kurang
    internal/secret     AES-256-GCM buat isi credential
    internal/store      semua SQL ada di sini, nggak ada di tempat lain
    internal/api        handler HTTP, semuanya di bawah /api
    internal/web        nyajikan bundle React dari dalam binary
    frontend            React 19 + Vite + TypeScript

## Jalan di lokal

Butuh Postgres. Yang paling gampang pakai yang sudah ada di compose:

```bash
cp .env.example .env
go run ./cmd/hq genkey   # jalankan dua kali, buat SESSION dan ENCRYPTION
```

Isi `.env`, lalu:

```bash
docker compose up -d postgres
cd frontend && npm install && npm run build && cd ..
go run ./cmd/hq
```

Buka http://localhost:8080.

Kalau lagi ngoprek tampilan, jalankan dua-duanya biar hot reload: `go run
./cmd/hq` di satu terminal, `npm run dev` di terminal lain, lalu buka
http://localhost:5173 — Vite yang nerusin `/api` ke Go.

## Kunci enkripsi

`HQ_ENCRYPTION_KEY` yang buka isi credential. Kalau kunci itu hilang, semua
secret yang tersimpan ikut hilang; nggak ada jalan pulih. Simpan salinannya di
tempat yang sama dengan credential vault yang lain, bukan cuma di `.env`.

`HQ_SESSION_KEY` cuma nandatangani cookie sesi — kalau diganti, efeknya semua
sesi logout, nggak ada data yang hilang.

## Perintah

```bash
go run ./cmd/hq genkey                  # cetak satu kunci base64 32 byte
go run ./cmd/hq passwd EMAIL PASSWORD   # bikin atau reset akun
go run ./cmd/hq passkeys-reset EMAIL    # hapus semua perangkat terdaftar
```

Akun pertama dibikin otomatis dari `HQ_OWNER_EMAIL` dan `HQ_OWNER_PASSWORD`,
tapi cuma waktu tabel `users` masih kosong — jadi variabel itu boleh ditinggal
di environment tanpa bikin password ke-reset tiap restart.

`passkeys-reset` itu jalan pulang kalau semua perangkat hilang: jalankan di
server, masuk pakai password saja, lalu daftarkan perangkat baru.

## Cara masuk

Password itu langkah pertama. Begitu ada minimal satu passkey terdaftar, dia
jadi langkah pertama dari dua, dan langkah keduanya konfirmasi sidik jari atau
wajah di perangkat yang sudah didaftarkan. Kalau belum ada passkey sama sekali,
password saja tetap cukup, jadi nggak ada yang bisa terkunci gara-gara nggak
pernah mendaftarkan perangkat.

Perangkat diatur di halaman **keamanan**. Ada tiga cara nambah: perangkat ini,
HP lewat QR lintas-perangkat bawaan browser, atau link sekali pakai yang
berlaku sepuluh menit buat perangkat yang lagi jauh.

## Ngisi otomatis

`scripts/scan.py` baca folder project, remote git-nya, lalu — kalau dikasih
`--server` — container yang jalan dan site nginx di sana, dan mendaftarkannya ke
HQ. Cuma nambah, nggak pernah nimpa, jadi aman diulang. Token yang nyangkut di
URL remote dibuang sebelum dikirim.

```bash
python3 scripts/scan.py --dry-run --server my-server   # lihat dulu
python3 scripts/scan.py --server my-server             # baru kirim
```

Yang ditebak scanner (jenis project, klien, aset mana milik project mana) belum
tentu benar — periksa di HQ setelahnya.

## Ngobrol lewat Claude

`POST /api/mcp` itu server MCP: dia ngasih daftar tool yang boleh dipanggil
asisten, terus ngejalanin. Semua tool-nya cuma baca dan credential nggak
diekspos sama sekali, jadi paling parah model yang salah paham cuma ngasih tau
sesuatu yang emang udah punya kamu.

Isi `HQ_MCP_TOKEN` pakai string acak yang panjang. Dikosongkan berarti
endpoint-nya mati, bukan kebuka dengan token yang gampang ditebak.

```bash
claude mcp add --transport http hq https://hq.example/api/mcp \
  --header "Authorization: Bearer TOKEN_KAMU"
```

Atau lewat `.mcp.json`, file yang sama yang dibaca Claude Desktop:

```json
{
  "mcpServers": {
    "hq": {
      "type": "http",
      "url": "https://hq.example/api/mcp",
      "headers": { "Authorization": "Bearer TOKEN_KAMU" }
    }
  }
}
```

App HP nggak bisa pakai bearer token. Di sana caranya didaftarin sebagai custom
connector, dan itu minta OAuth.

## Deploy

```bash
docker compose up -d --build
```

Container-nya dengerin di `127.0.0.1:8080`; nginx di depannya yang megang TLS.
Batas memori sudah dipasang di compose: app 96 MB, postgres 192 MB.

Set `HQ_RP_ID` dan `HQ_ORIGIN` ke host tempat dia disajikan. WebAuthn diikat ke
satu origin saja dan browser menolak yang lain, jadi nilai default-nya
(`localhost`) cuma buat jalan di lokal.

</details>
