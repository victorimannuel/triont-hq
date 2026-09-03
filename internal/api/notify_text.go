package api

import "fmt"

// The wording of everything that leaves the server as a notification. The app
// itself is translated in the browser, but a push notification is written here
// and arrives on a locked phone, so it has to carry its own language. Each
// device records the one it subscribed from; anything else falls back to
// Indonesian, which is what the digest spoke before this existed.

const defaultLang = "id"

func known(lang string) string {
	if lang == "en" {
		return "en"
	}
	return defaultLang
}

// pick returns the Indonesian or the English half of a pair.
func pick(lang, id, en string) string {
	if known(lang) == "en" {
		return en
	}
	return id
}

// count formats a number with its noun, taking the singular wording when there
// is exactly one of something. Indonesian passes the same phrasing twice.
func count(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf(one, n)
	}
	return fmt.Sprintf(many, n)
}

func textTroubleTitle(lang string, n int) string {
	return pick(lang,
		fmt.Sprintf("%d hal bermasalah", n),
		count(n, "%d thing in trouble", "%d things in trouble"),
	)
}

func textLowTitle(lang string, n int) string {
	return pick(lang,
		fmt.Sprintf("%d stok menipis", n),
		count(n, "%d supply running low", "%d supplies running low"),
	)
}

func textFixedOneTitle(lang, name string) string {
	return pick(lang, name+" normal lagi", name+" is fine again")
}

func textFixedTitle(lang string, n int) string {
	return pick(lang,
		fmt.Sprintf("%d hal normal lagi", n),
		count(n, "%d thing is fine again", "%d things are fine again"),
	)
}

// The kinds the calendar produces. The browser has its own copy of these in
// the dictionary; a notification is written here and never reaches it.
var eventKinds = map[string][2]string{
	"renewal":     {"perpanjangan", "renewal"},
	"document":    {"masa berlaku dokumen", "document expiry"},
	"warranty":    {"garansi", "warranty"},
	"maintenance": {"perawatan", "service"},
	"birthday":    {"ulang tahun", "birthday"},
	"rent":        {"sewa", "rent"},
	"income":      {"pemasukan", "income"},
	"expense":     {"pengeluaran", "expense"},
}

func textEventKind(lang, kind string) string {
	names, ok := eventKinds[kind]
	if !ok {
		return kind
	}
	return pick(lang, names[0], names[1])
}

// textEventDue is the line under a deadline's name: what sort of thing it is,
// and how long there is. Days are spelled out rather than dated, because a
// lock screen is read in a second and "3 hari lagi" needs no arithmetic.
func textEventDue(lang, kind string, days int) string {
	what := textEventKind(lang, kind)
	switch {
	case days < 0:
		return pick(lang,
			fmt.Sprintf("%s · telat %s", what, count(-days, "%d hari", "%d hari")),
			fmt.Sprintf("%s · %s late", what, count(-days, "%d day", "%d days")))
	case days == 0:
		return pick(lang, what+" · hari ini", what+" · today")
	case days == 1:
		return pick(lang, what+" · besok", what+" · tomorrow")
	default:
		return pick(lang,
			fmt.Sprintf("%s · %d hari lagi", what, days),
			fmt.Sprintf("%s · in %d days", what, days))
	}
}

// What a finished countdown says on a lock screen. A label is the whole point
// of having typed one, so it becomes the headline when there is one.
func textTimerDone(lang, label string) (string, string) {
	if label != "" {
		return label, pick(lang, "hitung mundurnya selesai.", "the countdown is done.")
	}
	return pick(lang, "waktunya habis", "time is up"),
		pick(lang, "hitung mundurnya selesai.", "the countdown is done.")
}

func textTimerToBreak(lang string, round int) (string, string) {
	return pick(lang, "istirahat", "break"),
		pick(lang,
			fmt.Sprintf("putaran %d selesai. waktunya istirahat.", round),
			fmt.Sprintf("round %d done. time for a break.", round))
}

func textTimerToWork(lang string) (string, string) {
	return pick(lang, "kerja", "work"), pick(lang, "balik kerja.", "back to work.")
}

func textBuyPrefix(lang string) string {
	return pick(lang, "beli: ", "buy: ")
}

func textAndMore(lang, named string, rest int) string {
	return pick(lang,
		fmt.Sprintf("%s, dan %d lagi", named, rest),
		fmt.Sprintf("%s, and %d more", named, rest),
	)
}

func textNothingDue(lang string) string {
	return pick(lang,
		"notifikasi jalan. nggak ada tenggat minggu ini.",
		"notifications work. nothing due this week.",
	)
}

func textSilentTitle(lang, source string) string {
	return pick(lang, source+" berhenti lapor", source+" stopped reporting")
}

func textSilentBody(lang, ago string, limit int) string {
	return pick(lang,
		fmt.Sprintf("terakhir %s lalu, batasnya %d menit", ago, limit),
		fmt.Sprintf("last seen %s ago, the limit is %d minutes", ago, limit),
	)
}

func textMinutes(lang string, n int) string {
	return pick(lang, fmt.Sprintf("%d menit", n), count(n, "%d minute", "%d minutes"))
}

func textHours(lang string, n int) string {
	return pick(lang, fmt.Sprintf("%d jam", n), count(n, "%d hour", "%d hours"))
}

func textDays(lang string, n int) string {
	return pick(lang, fmt.Sprintf("%d hari", n), count(n, "%d day", "%d days"))
}
