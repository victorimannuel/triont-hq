package api

// The values every dropdown in the app is allowed to hold. They live here
// rather than in the database because they are part of the interface, not the
// data: renaming a label should not need a migration, and an unknown value
// arriving from a client is a bug rather than a new option.
//
// valid() below is what keeps anything outside these lists from being stored.

type option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

var (
	statuses = []option{
		{"active", "Aktif"}, {"paused", "Ditunda"},
		{"done", "Selesai"}, {"archived", "Arsip"},
	}
	kinds = []option{
		{"odoo", "Odoo"}, {"website", "Website"}, {"webapp", "Web app"},
		{"infra", "Infra"}, {"internal", "Internal"}, {"other", "Lainnya"},
	}
	linkCategories = []option{
		{"repo", "Repo"}, {"production", "Produksi"}, {"staging", "Staging"},
		{"panel", "Panel / admin"}, {"docs", "Dokumen"}, {"design", "Desain"},
		{"other", "Lainnya"},
	}
	credentialKinds = []option{
		{"login", "Login"}, {"ssh", "SSH"}, {"database", "Database"},
		{"api", "API key"}, {"token", "Token"}, {"other", "Lainnya"},
	}
	assetKinds = []option{
		{"vps", "VPS / server"}, {"hosting", "Hosting"}, {"domain", "Domain"},
		{"ssl", "Sertifikat"}, {"saas", "Langganan"}, {"license", "Lisensi"},
		{"other", "Lainnya"},
	}
	// What is being counted, and in what. Kept short: a long list turns a
	// two-tap top-up into a decision.
	supplyCategories = []option{
		{"hygiene", "Kebersihan diri"}, {"cleaning", "Bersih-bersih"},
		{"kitchen", "Dapur"}, {"medicine", "Obat & P3K"},
		{"laundry", "Cucian"}, {"paper", "Kertas & tisu"},
		{"pet", "Hewan"}, {"other", "Lainnya"},
	}
	supplyUnits = []option{
		{"pcs", "buah"}, {"pack", "pak"}, {"roll", "gulung"},
		{"bottle", "botol"}, {"box", "kotak"}, {"sachet", "sachet"},
		{"tablet", "tablet"}, {"kg", "kg"}, {"litre", "liter"},
	}
	// Who a chord chart is written for. Empty is a real answer and the common
	// one — the same chords work for both — so it is not in the list.
	songParts = []option{
		{"bass", "Bass"}, {"piano", "Piano / keyboard"},
	}
	assetStatuses = []option{
		{"active", "Aktif"}, {"ending", "Mau dihentikan"},
		{"stopped", "Berhenti"}, {"expired", "Kedaluwarsa"},
	}
	billingCycles = []option{
		{"once", "Sekali bayar"}, {"monthly", "Bulanan"},
		{"quarterly", "Tiga bulanan"}, {"yearly", "Tahunan"},
	}
	currencies    = []option{{"IDR", "IDR"}, {"USD", "USD"}, {"SGD", "SGD"}, {"EUR", "EUR"}}
	documentKinds = []option{
		{"ktp", "KTP"}, {"kk", "Kartu keluarga"}, {"passport", "Paspor"},
		{"sim", "SIM"}, {"stnk", "STNK"}, {"bpkb", "BPKB"},
		{"npwp", "NPWP"}, {"bpjs", "BPJS"}, {"insurance", "Polis asuransi"},
		{"certificate", "Sertifikat"}, {"contract", "Kontrak"}, {"other", "Lainnya"},
	}
	belongingKinds = []option{
		{"vehicle", "Kendaraan"}, {"electronics", "Elektronik"},
		{"appliance", "Perabot"}, {"furniture", "Mebel"},
		{"property", "Properti"}, {"other", "Lainnya"},
	}
	belongingStatuses = []option{
		{"active", "Dipakai"}, {"idle", "Nganggur"},
		{"broken", "Rusak"}, {"sold", "Sudah dilepas"},
	}
	maintenanceKinds = []option{
		{"service", "Servis"}, {"tax", "Pajak"}, {"repair", "Perbaikan"},
		{"inspection", "Pemeriksaan"}, {"other", "Lainnya"},
	}
	conditions = []option{
		{"new", "Baru"}, {"used", "Bekas"},
	}
	ownerships = []option{
		{"owned", "Milik sendiri"}, {"rented", "Sewa"}, {"leased", "Kontrak"},
	}
	expenseCategories = []option{
		{"salary", "Gaji"}, {"subscription", "Langganan"}, {"utility", "Utilitas"},
		{"loan", "Cicilan"}, {"office", "Kantor"}, {"tax", "Pajak"},
		{"other", "Lainnya"},
	}
	incomeStatuses = []option{
		{"active", "Jalan"}, {"paused", "Berhenti sementara"}, {"ended", "Selesai"},
	}
	clientKinds = []option{
		{"company", "Perusahaan"}, {"person", "Pribadi"},
	}
	clientStatuses = []option{
		{"active", "Aktif"}, {"prospect", "Calon"},
		{"paused", "Vakum"}, {"past", "Sudah selesai"},
	}
	// The four things a month's money can be for. Deliberately not editable:
	// the split only means anything because it does not move, and a fifth
	// bucket is almost always a Want being argued with.
	budgetBuckets = []option{
		{"needs", "Kebutuhan"}, {"wants", "Keinginan"},
		{"savings", "Tabungan"}, {"debt", "Utang"},
	}
	// Which sitting a meal was. Not the time it happened — that is on the
	// record already — but which of the day's meals it counts as, because
	// "sarapan at eleven" is still a person's breakfast.
	mealKinds = []option{
		{"breakfast", "Sarapan"}, {"lunch", "Makan siang"},
		{"dinner", "Makan malam"}, {"snack", "Cemilan"},
		{"drink", "Minum"}, {"other", "Lainnya"},
	}
	// The personal task tracker, kept in step with the shared NPD spreadsheet
	// so a row means the same thing in both. Labels stay in English here
	// because that is what the spreadsheet uses.
	trackerPriorities = []option{
		{"urgent", "Urgent"}, {"high", "High"}, {"normal", "Normal"}, {"low", "Low"},
	}
	trackerProjects = []option{
		{"npd", "NPD"}, {"afs", "AFS"}, {"sc", "SC"}, {"general", "General"},
	}
	trackerOwners = []option{
		{"kevin", "Kevin"}, {"victor", "Victor"}, {"jaffy", "Jaffy"},
		{"unassigned", "Unassigned"},
	}
	trackerStatuses = []option{
		{"todo", "To Do"}, {"in_progress", "In Progress"}, {"needs_check", "Needs Check"},
		{"done", "Done"}, {"blocked", "Blocked"}, {"on_hold", "On Hold"},
	}
	// Companies are not here: they live in the tracker_companies table so they can
	// be added from the app. handleMeta reads them from there.
)

// valid returns value when the list allows it and fallback otherwise, so a
// client sending something unexpected gets a sane record rather than an error
// or a stored typo.
func valid(options []option, value, fallback string) string {
	for _, o := range options {
		if o.Value == value {
			return value
		}
	}
	return fallback
}
