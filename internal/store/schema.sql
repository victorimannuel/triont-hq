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

-- Browsers that agreed to be notified. The endpoint is the browser's own push
-- service URL and identifies the device, so re-subscribing updates in place
-- rather than piling up a row per visit.
create table if not exists push_subscriptions (
    id           bigserial primary key,
    user_id      bigint not null references users (id) on delete cascade,
    endpoint     text not null unique,
    p256dh       text not null,
    auth         text not null,
    device       text not null default '',
    failures     int not null default 0,
    last_sent_at timestamptz,
    created_at   timestamptz not null default now()
);

-- One row per day the digest went out. A restart in the afternoon must not
-- send the morning's reminder a second time.
create table if not exists push_digests (
    sent_on date primary key,
    sent_at timestamptz not null default now()
);

-- Things that get used up rather than owned: tissue, cotton buds, cooking oil.
-- Separate from belongings on purpose — nothing here has a warranty or a
-- service history, and the only question asked of it is whether to buy more.
create table if not exists supplies (
    id                bigserial primary key,
    name              text not null,
    category          text not null default 'other',
    location          text not null default '',
    unit              text not null default 'pcs',
    quantity          numeric(10, 2) not null default 0,
    -- At or below this, it counts as running out.
    low_at            numeric(10, 2) not null default 1,
    notes             text not null default '',
    last_restocked_on date,
    created_by        text not null default '',
    updated_by        text not null default '',
    deleted_at        timestamptz,
    deleted_by        text not null default '',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists supplies_live_idx on supplies (deleted_at);
create index if not exists supplies_low_idx  on supplies ((quantity <= low_at));

-- Every time something was bought. Two questions this answers that a running
-- count cannot: how long a pack actually lasts, and what it used to cost.
create table if not exists supply_purchases (
    id         bigserial primary key,
    supply_id  bigint not null references supplies (id) on delete cascade,
    bought_on  date not null default current_date,
    quantity   numeric(10, 2) not null default 1,
    price      numeric(14, 2) not null default 0,
    currency   text not null default 'IDR',
    vendor     text not null default '',
    notes      text not null default '',
    created_by text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists supply_purchases_idx on supply_purchases (supply_id, bought_on desc);

-- Things watched by something outside HQ. Monitors report in; HQ never goes
-- looking, because a checker holds credentials this app should not.
create table if not exists monitors (
    source               text primary key,
    last_seen_at         timestamptz not null default now(),
    -- How long it may stay quiet before the silence is itself the problem.
    silent_after_minutes int not null default 60,
    created_at           timestamptz not null default now()
);

create table if not exists monitor_checks (
    id         bigserial primary key,
    source     text not null,
    key        text not null,
    name       text not null default '',
    status     text not null default 'ok',
    detail     text not null default '',
    url        text not null default '',
    -- When this state began, not when it was last confirmed: a three-day
    -- outage should read as three days old.
    since_at   timestamptz not null default now(),
    checked_at timestamptz not null default now(),
    unique (source, key)
);

create index if not exists monitor_trouble_idx on monitor_checks (status) where status <> 'ok';

-- Whether this monitor's silence has already been announced. Without it a
-- monitor that stays dead would push every time the loop noticed.
alter table monitors add column if not exists stale_notified boolean not null default false;

-- Files belonging to a record. In the database rather than on disk so the
-- nightly dump covers them without a second backup path, and encrypted with
-- the same key as credential secrets: the scan of a document is more sensitive
-- than the number printed on it.
create table if not exists attachments (
    id         bigserial primary key,
    entity     text not null,
    entity_id  bigint not null,
    name       text not null,
    mime_type  text not null default 'application/octet-stream',
    -- The original size, not the ciphertext's.
    size       bigint not null default 0,
    notes      text not null default '',
    content    bytea not null,
    created_by text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists attachments_owner_idx on attachments (entity, entity_id);

-- The morning digest is written on the server, so each device records the
-- language it was subscribed from. Rows that predate the column keep the
-- Indonesian the digest already spoke.
alter table push_subscriptions add column if not exists lang text not null default 'id';

-- The alarm for a running countdown, held here so it can go off with the app
-- closed. One row per person: a phone has one timer, and so does this.
create table if not exists timer_alarms (
    user_id  bigint primary key references users (id) on delete cascade,
    fires_at timestamptz not null,
    label    text not null default '',
    -- plain, work or break: a focus run has to know which half just ended so
    -- the next one can be armed.
    kind     text not null default 'plain',
    round    int  not null default 1
);

create index if not exists timer_alarms_due_idx on timer_alarms (fires_at);

-- One row per deadline per morning it was announced. A deadline speaks every
-- day of the week before it lands, so the day is part of the key; without it
-- the first morning would be the only one. The key also carries the deadline's
-- own date, which is what makes next year's birthday a new row rather than one
-- already spoken for.
create table if not exists event_notices (
    event_key text not null,
    sent_on   date not null,
    sent_at   timestamptz not null default now(),
    primary key (event_key, sent_on)
);

-- What the notification actually said it was about. The key identifies the
-- deadline but is not readable, and the row it pointed at may be gone by the
-- time anybody looks back, so the name is kept here rather than looked up.
alter table event_notices add column if not exists label text not null default '';

-- Read state, so the list of what was sent can be worked through rather than
-- only looked at. Null means unread, which is what every row starts as.
alter table event_notices add column if not exists read_at timestamptz;

create index if not exists event_notices_unread_idx on event_notices (read_at)
    where read_at is null;

-- Two lists that are really one table. A thing to do and a thing to buy get
-- written down the same way and ticked off the same way; what differs is when
-- you read them, so they are told apart by a column and shown on separate
-- pages rather than kept in separate tables.
create table if not exists tasks (
    id         bigserial primary key,
    kind       text not null default 'todo',
    title      text not null,
    -- Only a to-do carries one. A shopping list is read standing in a shop,
    -- not on a date, so a deadline on it would be noise.
    due_on     date,
    -- Null until ticked. The moment is kept rather than a flag, because "what
    -- did I get done today" needs it and a boolean throws it away.
    done_at    timestamptz,
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Every read is one kind at a time, unticked first.
create index if not exists tasks_kind_idx on tasks (kind, done_at, due_on);

-- Chord charts, for playing off rather than reading about. The body is stored
-- exactly as it was typed and is never tidied: where a chord sits above the
-- syllable it lands on is the whole information, and reformatting would throw
-- that away. Transposing happens on the way to the screen for the same reason.
create table if not exists songs (
    id         bigserial primary key,
    title      text not null,
    artist     text not null default '',
    -- The key the chart below is written in, so a transpose can say what it
    -- landed on rather than only how far it moved.
    song_key   text not null default '',
    tempo      int not null default 0,
    -- Who is reading it on the night: bass, piano, or both when left empty.
    part       text not null default '',
    body       text not null default '',
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

create index if not exists songs_live_idx on songs (deleted_at);

-- An evening's worth of songs, in the order they get played. Its own table
-- rather than a tag on a song, because the same song turns up in many nights
-- and the order is the point.
create table if not exists setlists (
    id         bigserial primary key,
    name       text not null,
    plays_on   date,
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

create index if not exists setlists_live_idx on setlists (deleted_at);

-- One song's place in one evening. It has an id of its own rather than a key
-- of (setlist, song) so a song can come back for a reprise.
create table if not exists setlist_songs (
    id         bigserial primary key,
    setlist_id bigint not null references setlists (id) on delete cascade,
    song_id    bigint not null references songs (id) on delete cascade,
    position   int not null default 0,
    -- How far this night wants it moved from the key it is written in. The
    -- song keeps its own key; this is only "tonight, in Bb".
    steps      int not null default 0
);

create index if not exists setlist_songs_order_idx on setlist_songs (setlist_id, position);

-- Something you mean to do most days. Kept rather than deleted when you give
-- up on one: the history is the whole point of having tracked it.
create table if not exists habits (
    id         bigserial primary key,
    name       text not null,
    notes      text not null default '',
    active     boolean not null default true,
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

create index if not exists habits_live_idx on habits (deleted_at);

-- One day it got done. The row existing is the fact, so there is no boolean
-- to disagree with it and unticking is a delete.
create table if not exists habit_days (
    habit_id bigint not null references habits (id) on delete cascade,
    on_date  date not null,
    primary key (habit_id, on_date)
);

create index if not exists habit_days_recent_idx on habit_days (on_date);

-- What a day of this habit is counted in, written by hand: "kali", "pasal",
-- "menit". Empty leaves the habit a plain yes or no, which is what all of them
-- were before this.
alter table habits add column if not exists unit text not null default '';

-- How much got done that day. Defaulting to 1 is what keeps every row written
-- before this column existed meaning exactly what it meant then: done once.
alter table habit_days add column if not exists amount numeric not null default 1;

-- One line a day. Keyed by the date rather than an id: the point of it is that
-- there is exactly one per day, and an empty line is no row at all rather than
-- a row that says nothing.
create table if not exists journal_days (
    on_date    date primary key,
    line       text not null,
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Soft delete for the rows that hang off something else, plus the two lists.
-- Everything here is typed or uploaded by hand, so deleting one by mistake
-- used to be final: the parent's own bin never covered its children.
--
-- habit_days is deliberately absent. A tick existing IS the fact that the day
-- got done, so a tick that exists but is deleted would be a contradiction, and
-- the undo for one is ticking it again.
alter table project_links     add column if not exists deleted_at timestamptz;
alter table project_links     add column if not exists deleted_by text not null default '';
alter table maintenance_logs  add column if not exists deleted_at timestamptz;
alter table maintenance_logs  add column if not exists deleted_by text not null default '';
alter table supply_purchases  add column if not exists deleted_at timestamptz;
alter table supply_purchases  add column if not exists deleted_by text not null default '';
alter table setlist_songs     add column if not exists deleted_at timestamptz;
alter table setlist_songs     add column if not exists deleted_by text not null default '';
alter table attachments       add column if not exists deleted_at timestamptz;
alter table attachments       add column if not exists deleted_by text not null default '';
alter table tasks             add column if not exists deleted_at timestamptz;
alter table tasks             add column if not exists deleted_by text not null default '';
alter table journal_days      add column if not exists deleted_at timestamptz;
alter table journal_days      add column if not exists deleted_by text not null default '';

create index if not exists project_links_live_idx    on project_links (deleted_at);
create index if not exists maintenance_logs_live_idx on maintenance_logs (deleted_at);
create index if not exists supply_purchases_live_idx on supply_purchases (deleted_at);
create index if not exists setlist_songs_live_idx    on setlist_songs (deleted_at);
create index if not exists attachments_live_idx      on attachments (deleted_at);
create index if not exists tasks_live_idx            on tasks (deleted_at);
create index if not exists journal_days_live_idx     on journal_days (deleted_at);

/*
Budgeting: deciding at the start of a month where the money is going, and
ticking it off as it goes.

This is not expense tracking and there is no row here for a cup of coffee. The
unit is an allocation — "Monthly Eats, 600k, Wants" — decided once and then
either done or not. That is how the spreadsheet this replaces worked, and it is
the honest shape: a line item per purchase is a habit nobody keeps.
*/

-- Where money sits. Typed in by hand and trusted as typed: no bank reachable
-- from here has an API worth the trouble, and a stale number you entered beats
-- a missing one.
create table if not exists money_accounts (
    id         bigserial primary key,
    name       text not null,
    balance    numeric not null default 0,
    currency   text not null default 'IDR',
    position   integer not null default 0,
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

create index if not exists money_accounts_live_idx on money_accounts (deleted_at);

-- One month of allocating, keyed by its first day. Income is the figure every
-- percentage below is a percentage of, and it is entered rather than derived:
-- what lands in the account is known before the allocating starts.
create table if not exists budget_months (
    on_month   date primary key,
    income     numeric not null default 0,
    currency   text not null default 'IDR',
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

/*
One allocation inside a month.

An amount can be given outright or as a share of the month's income; `percent`
being null is what says which. A share is the useful form for anything phrased
as "5% of salary", because the number then follows a raise without being
edited.
*/
create table if not exists budget_lines (
    id         bigserial primary key,
    on_month   date not null references budget_months (on_month) on delete cascade,
    name       text not null,
    account_id bigint references money_accounts (id) on delete set null,
    -- needs, wants, savings or debt.
    bucket     text not null default 'needs',
    amount     numeric not null default 0,
    percent    numeric,
    paid       boolean not null default false,
    -- The recurring expense this was generated from, so next month knows not
    -- to add it twice.
    expense_id bigint references expense_streams (id) on delete set null,
    position   integer not null default 0,
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

create index if not exists budget_lines_month_idx on budget_lines (on_month, position, id);
create index if not exists budget_lines_live_idx  on budget_lines (deleted_at);

/*
What is expected to come in this month, one row per source.

A month's income is the sum of these rather than a single figure typed at the
top: it arrives as a salary and three invoices and a handful of small fees, and
a lone number would mean adding them up somewhere else first. `received` is the
tick, so the page can also say how much has actually landed.
*/
create table if not exists budget_incomes (
    id         bigserial primary key,
    on_month   date not null references budget_months (on_month) on delete cascade,
    name       text not null,
    amount     numeric not null default 0,
    account_id bigint references money_accounts (id) on delete set null,
    received   boolean not null default false,
    position   integer not null default 0,
    notes      text not null default '',
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text not null default ''
);

-- What the source pays in. Freelance work does not always pay in rupiah, and
-- converting it by hand before typing it in is the sort of arithmetic that
-- ends up wrong in a spreadsheet.
alter table budget_incomes add column if not exists currency text not null default 'IDR';

create index if not exists budget_incomes_month_idx on budget_incomes (on_month, position, id);
create index if not exists budget_incomes_live_idx  on budget_incomes (deleted_at);

-- The day the money is expected, and the day the line falls due. Both optional:
-- a salary lands on the 25th and the rent is due on the 3rd, but plenty of a
-- month is just "some time this month", and making up a date for those would be
-- inventing information the page then has to be trusted on.
alter table budget_incomes add column if not exists due_on date;
alter table budget_lines   add column if not exists due_on date;

-- What share of a month each bucket is meant to take. One row per bucket, so
-- "normally 5%" stops being a note in a name and becomes something the page
-- can hold the real figure up against.
create table if not exists budget_targets (
    bucket  text primary key,
    percent numeric not null default 0
);

-- A birthday that has gone by is not overdue and it is not finished either; it
-- is waiting on you to say you did something about it. Nothing on the contact
-- itself can record that, because the answer is different every year, so the
-- occurrence gets a row of its own.
--
-- `ref` is the entry's own URL, which is what already identifies the thing the
-- date hangs off, and the date pins which occurrence. Both together with the
-- kind, because a contact's birthday and their day count share a URL.
create table if not exists calendar_marks (
    id         bigserial primary key,
    kind       text not null,
    ref        text not null,
    on_date    date not null,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    unique (kind, ref, on_date)
);

-- What you actually did about it, in your own words. The tick alone says the
-- date was dealt with but not how, and a year later "udah telpon" is the part
-- worth having.
alter table calendar_marks add column if not exists note text not null default '';
