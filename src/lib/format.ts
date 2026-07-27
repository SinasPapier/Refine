// Kleine Hilfsfunktionen für Anzeige und Umrechnung.

/** Minuten -> "1h 30m" */
export function formatDauer(minuten: number): string {
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Minuten -> Dezimalstunden mit 2 Nachkommastellen ("1.50") */
export function formatStundenDezimal(minuten: number): string {
  return (minuten / 60).toFixed(2)
}

/** "HH:MM" oder "H,MM"/"H.MM" oder reine Zahl -> Minuten. */
export function parseDauerZuMinuten(eingabe: string): number | null {
  const text = eingabe.trim()
  if (!text) return null
  if (text.includes(':')) {
    const [h, m] = text.split(':')
    const stunden = parseInt(h, 10)
    const minuten = parseInt(m, 10)
    if (Number.isNaN(stunden) || Number.isNaN(minuten)) return null
    return stunden * 60 + minuten
  }
  const dezimal = parseFloat(text.replace(',', '.'))
  if (Number.isNaN(dezimal)) return null
  return Math.round(dezimal * 60)
}

/** ISO-Datum -> "26.07.2026" (immer zweistellig, damit Listen ruhig wirken) */
export function formatDatum(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** ISO-Zeitstempel -> "26.07.2026, 14:03" */
export function formatZeitstempel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Zahlenwert einer Kundennummer, z. B. "K-00006" -> 6.
 * Nötig, weil eine reine Textsortierung "K-00010" vor "K-00006" einordnen
 * würde. Ohne Nummer wird -1 zurückgegeben, damit solche Kunden hinten stehen.
 */
export function kundennummerWert(nummer: string | null): number {
  if (!nummer) return -1
  const ziffern = nummer.replace(/\D/g, '')
  if (!ziffern) return -1
  return parseInt(ziffern, 10)
}
