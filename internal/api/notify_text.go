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

func textDueAndLowTitle(lang string, due, low int) string {
	return pick(lang,
		fmt.Sprintf("%d tenggat, %d stok menipis", due, low),
		fmt.Sprintf("%s, %s",
			count(due, "%d deadline", "%d deadlines"),
			count(low, "%d supply running low", "%d supplies running low")),
	)
}

func textDueTitle(lang string, n int) string {
	return pick(lang,
		fmt.Sprintf("%d tenggat minggu ini", n),
		count(n, "%d deadline this week", "%d deadlines this week"),
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
