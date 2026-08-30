create table if not exists users (
    id            bigserial primary key,
    email         text not null unique,
    password_hash text not null,
    created_at    timestamptz not null default now()
);

create table if not exists projects (
    id            bigserial primary key,
    slug          text not null unique,
    name          text not null,
    client        text not null default '',
    status        text not null default 'active',
    kind          text not null default 'other',
    summary       text not null default '',
    local_path    text not null default '',
    deploy_target text not null default '',
    notes         text not null default '',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists projects_status_idx on projects (status);
create index if not exists projects_client_idx on projects (client);

create table if not exists project_links (
    id         bigserial primary key,
    project_id bigint not null references projects (id) on delete cascade,
    label      text not null,
    url        text not null,
    category   text not null default 'other',
    notes      text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists project_links_project_idx on project_links (project_id);

-- project_id is nullable on purpose: some secrets belong to no project.
create table if not exists credentials (
    id               bigserial primary key,
    project_id       bigint references projects (id) on delete cascade,
    label            text not null,
    kind             text not null default 'other',
    username         text not null default '',
    host             text not null default '',
    url              text not null default '',
    secret_encrypted text not null default '',
    notes            text not null default '',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists credentials_project_idx on credentials (project_id);

-- Audit columns. Added after the first release, so they arrive as ALTERs that
-- are safe to re-run on every boot alongside the CREATEs above.
alter table projects      add column if not exists created_by text not null default '';
alter table projects      add column if not exists updated_by text not null default '';
alter table project_links add column if not exists created_by text not null default '';
alter table credentials   add column if not exists created_by text not null default '';
alter table credentials   add column if not exists updated_by text not null default '';

-- Links became editable after the first release, so they need the same
-- "last modified" pair the other tables already carry.
alter table project_links add column if not exists updated_by text not null default '';
alter table project_links add column if not exists updated_at timestamptz not null default now();

-- Assets are the things a project runs on or costs money for: a VPS, a domain,
-- a certificate, a paid account. A VPS hosts many projects and a project can
-- sit on several assets, so the link between them is its own table.
create table if not exists assets (
    id             bigserial primary key,
    name           text not null,
    kind           text not null default 'other',
    provider       text not null default '',
    identifier     text not null default '',
    status         text not null default 'active',
    -- numeric, not cents: this mixes IDR (no decimals) with USD, and the
    -- amounts here are small enough that float rounding never shows.
    cost_amount    numeric(14, 2) not null default 0,
    cost_currency  text not null default 'IDR',
    billing_cycle  text not null default 'yearly',
    renews_on      date,
    auto_renew     boolean not null default false,
    notes          text not null default '',
    created_by     text not null default '',
    updated_by     text not null default '',
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists assets_status_idx   on assets (status);
create index if not exists assets_renews_idx   on assets (renews_on);

create table if not exists project_assets (
    project_id bigint not null references projects (id) on delete cascade,
    asset_id   bigint not null references assets (id) on delete cascade,
    role       text not null default '',
    created_at timestamptz not null default now(),
    primary key (project_id, asset_id)
);

create index if not exists project_assets_asset_idx on project_assets (asset_id);

-- Clients were a free-text column on projects at first. They get their own
-- table here, and the backfill below turns whatever text is already there into
-- real rows, so nothing has to be retyped.
create table if not exists clients (
    id         bigserial primary key,
    slug       text not null unique,
    name       text not null,
    company    text not null default '',
    status     text not null default 'active',
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists contacts (
    id         bigserial primary key,
    client_id  bigint references clients (id) on delete cascade,
    name       text not null,
    role       text not null default '',
    email      text not null default '',
    phone      text not null default '',
    is_primary boolean not null default false,
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists contacts_client_idx on contacts (client_id);

alter table projects add column if not exists client_id bigint references clients (id) on delete set null;
create index if not exists projects_client_id_idx on projects (client_id);

insert into clients (slug, name)
select distinct trim(both '-' from lower(regexp_replace(client, '[^a-zA-Z0-9]+', '-', 'g'))), client
  from projects
 where client <> '' and client_id is null
on conflict (slug) do nothing;

update projects p
   set client_id = c.id
  from clients c
 where p.client_id is null
   and p.client <> ''
   and c.slug = trim(both '-' from lower(regexp_replace(p.client, '[^a-zA-Z0-9]+', '-', 'g')));

-- Soft delete. Baris yang dihapus tetap ada, cuma disembunyikan, jadi salah
-- pencet bisa dibatalkan. Semua query baca menyaring deleted_at is null.
alter table projects    add column if not exists deleted_at timestamptz;
alter table projects    add column if not exists deleted_by text not null default '';
alter table clients     add column if not exists deleted_at timestamptz;
alter table clients     add column if not exists deleted_by text not null default '';
alter table assets      add column if not exists deleted_at timestamptz;
alter table assets      add column if not exists deleted_by text not null default '';
alter table credentials add column if not exists deleted_at timestamptz;
alter table credentials add column if not exists deleted_by text not null default '';

create index if not exists projects_live_idx    on projects (deleted_at);
create index if not exists clients_live_idx     on clients (deleted_at);
create index if not exists assets_live_idx      on assets (deleted_at);
create index if not exists credentials_live_idx on credentials (deleted_at);

-- Tag dipisah dari klien: klien itu siapa yang bayar, tag itu cara kamu sendiri
-- mengelompokkan. Taggings sengaja generik (entity + entity_id) supaya nanti
-- aset atau credential bisa ikut ditandai tanpa tabel baru.
create table if not exists tags (
    id         bigserial primary key,
    slug       text not null unique,
    name       text not null,
    color      text not null default '',
    created_by text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists taggings (
    tag_id     bigint not null references tags (id) on delete cascade,
    entity     text not null,
    entity_id  bigint not null,
    created_at timestamptz not null default now(),
    primary key (tag_id, entity, entity_id)
);

create index if not exists taggings_entity_idx on taggings (entity, entity_id);

-- Dokumen pribadi: KTP, paspor, SIM, STNK, polis, sertifikat. Nomornya PII,
-- jadi disimpan ke-enkripsi persis seperti secret credential dan cuma kebuka
-- lewat endpoint reveal tersendiri.
create table if not exists documents (
    id               bigserial primary key,
    name             text not null,
    kind             text not null default 'other',
    holder           text not null default '',
    number_encrypted text not null default '',
    issuer           text not null default '',
    issued_on        date,
    expires_on       date,
    location         text not null default '',
    notes            text not null default '',
    created_by       text not null default '',
    updated_by       text not null default '',
    deleted_at       timestamptz,
    deleted_by       text not null default '',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists documents_expires_idx on documents (expires_on);
create index if not exists documents_live_idx    on documents (deleted_at);

-- Barang milik pribadi: kendaraan, elektronik, perabot, properti. Yang bikin
-- dia berguna bukan daftarnya, tapi riwayat perawatan dan kapan jatuh tempo
-- berikutnya.
create table if not exists belongings (
    id             bigserial primary key,
    name           text not null,
    kind           text not null default 'other',
    brand          text not null default '',
    model          text not null default '',
    year           integer,
    identifier     text not null default '',
    acquired_on    date,
    price          numeric(14, 2) not null default 0,
    currency       text not null default 'IDR',
    warranty_until date,
    location       text not null default '',
    status         text not null default 'active',
    notes          text not null default '',
    created_by     text not null default '',
    updated_by     text not null default '',
    deleted_at     timestamptz,
    deleted_by     text not null default '',
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists belongings_live_idx on belongings (deleted_at);
create index if not exists belongings_kind_idx on belongings (kind);

create table if not exists maintenance_logs (
    id           bigserial primary key,
    belonging_id bigint not null references belongings (id) on delete cascade,
    done_on      date not null default current_date,
    kind         text not null default 'service',
    odometer     integer,
    description  text not null default '',
    vendor       text not null default '',
    cost         numeric(14, 2) not null default 0,
    next_due     date,
    created_by   text not null default '',
    created_at   timestamptz not null default now()
);

create index if not exists maintenance_belonging_idx on maintenance_logs (belonging_id);
create index if not exists maintenance_next_due_idx  on maintenance_logs (next_due);

-- Kontak dipakai ulang buat buku alamat pribadi: yang client_id-nya kosong
-- adalah orang, bukan PIC klien.
alter table contacts add column if not exists birthday          date;
alter table contacts add column if not exists last_contacted_on date;
alter table contacts add column if not exists reach_every_days  integer not null default 0;
alter table contacts add column if not exists deleted_at        timestamptz;
alter table contacts add column if not exists deleted_by        text not null default '';

create index if not exists contacts_live_idx on contacts (deleted_at);

alter table contacts add column if not exists nickname text not null default '';

-- Klien bisa perusahaan atau orang. Kalau perusahaan, `name` itu nama
-- perusahaannya; kalau pribadi, itu nama orangnya. Kolom `company` yang lama
-- ditinggal, nggak dipakai form lagi.
alter table clients add column if not exists kind text not null default 'company';

-- Barang nggak selalu milik sendiri: rumah bisa disewa, kantor bisa dikontrak.
alter table belongings add column if not exists ownership   text not null default 'owned';
alter table belongings add column if not exists rent_amount numeric(14, 2) not null default 0;
alter table belongings add column if not exists rent_cycle  text not null default 'monthly';
alter table belongings add column if not exists rent_due_on date;

create index if not exists belongings_rent_due_idx on belongings (rent_due_on);

-- Pemasukan yang jalan terus: retainer, sewa yang diterima, langganan klien.
-- Bisa nempel ke klien, ke project, atau berdiri sendiri.
create table if not exists income_streams (
    id          bigserial primary key,
    name        text not null,
    client_id   bigint references clients (id) on delete set null,
    project_id  bigint references projects (id) on delete set null,
    amount      numeric(14, 2) not null default 0,
    currency    text not null default 'IDR',
    cycle       text not null default 'monthly',
    status      text not null default 'active',
    started_on  date,
    ended_on    date,
    next_due_on date,
    notes       text not null default '',
    created_by  text not null default '',
    updated_by  text not null default '',
    deleted_at  timestamptz,
    deleted_by  text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists income_live_idx    on income_streams (deleted_at);
create index if not exists income_client_idx  on income_streams (client_id);
create index if not exists income_project_idx on income_streams (project_id);
create index if not exists income_due_idx     on income_streams (next_due_on);

-- Kalau beli, perlu tahu beli baru atau bekas.
alter table belongings add column if not exists condition text not null default 'new';

-- Pengeluaran rutin yang bukan aset: gaji, langganan, cicilan, listrik.
create table if not exists expense_streams (
    id          bigserial primary key,
    name        text not null,
    category    text not null default 'other',
    project_id  bigint references projects (id) on delete set null,
    amount      numeric(14, 2) not null default 0,
    currency    text not null default 'IDR',
    cycle       text not null default 'monthly',
    status      text not null default 'active',
    started_on  date,
    ended_on    date,
    next_due_on date,
    notes       text not null default '',
    created_by  text not null default '',
    updated_by  text not null default '',
    deleted_at  timestamptz,
    deleted_by  text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists expense_live_idx on expense_streams (deleted_at);
create index if not exists expense_due_idx  on expense_streams (next_due_on);

-- Kurs ke rupiah, disimpan apa adanya beserta kapan diambil. Angka konversi
-- tanpa tanggalnya itu menyesatkan, jadi dua-duanya selalu ikut.
create table if not exists fx_rates (
    currency   text primary key,
    rate       numeric(18, 6) not null,
    fetched_at timestamptz not null default now()
);

-- Passkey (WebAuthn). Kredensialnya disimpan utuh sebagai JSON: bentuknya
-- ditentukan pustaka WebAuthn, dan memecahnya per kolom cuma bikin rapuh tiap
-- pustakanya berubah. credential_id dipisah supaya bisa dicari.
create table if not exists webauthn_credentials (
    id            bigserial primary key,
    user_id       bigint not null references users (id) on delete cascade,
    credential_id bytea not null unique,
    credential    jsonb not null,
    name          text not null default '',
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz
);

create index if not exists webauthn_user_idx on webauthn_credentials (user_id);

-- An asset that costs money is already a recurring expense; pointing an
-- expense row at it says "this is that bill", which keeps the asset's own cost
-- from being counted a second time.
alter table expense_streams add column if not exists asset_id bigint references assets (id) on delete set null;
create index if not exists expense_asset_idx on expense_streams (asset_id);

-- A one-shot invitation to register a passkey on a device that is nowhere near
-- the one holding the session. The cross-device QR needs the two within
-- Bluetooth range; this is the way in when they are not.
create table if not exists enrol_tokens (
    id         bigserial primary key,
    user_id    bigint not null references users (id) on delete cascade,
    nonce      bytea not null unique,
    expires_at timestamptz not null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
);

-- Which machine this was, and roughly where, so an entry that does not belong
-- reads as one at a glance.
alter table webauthn_credentials add column if not exists device text not null default '';
alter table webauthn_credentials add column if not exists user_agent text not null default '';
alter table webauthn_credentials add column if not exists ip text not null default '';
alter table webauthn_credentials add column if not exists location text not null default '';
alter table webauthn_credentials add column if not exists last_used_ip text not null default '';
alter table webauthn_credentials add column if not exists last_used_location text not null default '';

-- "Which account is this under?" was unanswerable: the provider was recorded
-- but not the login it was bought with. Pointing at the credential answers it
-- without copying the username into a second place.
alter table assets add column if not exists credential_id bigint references credentials (id) on delete set null;
create index if not exists assets_credential_idx on assets (credential_id);
