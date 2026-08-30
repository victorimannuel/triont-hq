# HQ

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
```

Akun pertama dibikin otomatis dari `HQ_OWNER_EMAIL` dan `HQ_OWNER_PASSWORD`,
tapi cuma waktu tabel `users` masih kosong — jadi variabel itu boleh ditinggal
di environment tanpa bikin password ke-reset tiap restart.

## Ngisi otomatis

`scripts/scan.py` baca folder `~/projects`, remote git-nya, lalu — kalau dikasih
`--server` — container yang jalan dan site nginx di sana, dan mendaftarkannya ke
HQ. Cuma nambah, nggak pernah nimpa, jadi aman diulang. Token yang nyangkut di
URL remote dibuang sebelum dikirim.

```bash
python3 scripts/scan.py --dry-run --server my-server   # lihat dulu
python3 scripts/scan.py --server my-server             # baru kirim
```

Yang ditebak scanner (jenis project, klien, aset mana milik project mana) belum
tentu benar — periksa di HQ setelahnya.

## Deploy

```bash
docker compose up -d --build
```

Container-nya dengerin di `127.0.0.1:8080`; nginx di depannya yang megang TLS.
Batas memori sudah dipasang di compose: app 96 MB, postgres 192 MB.
