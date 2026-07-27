// Datums-Hilfsfunktionen für Kalender und Abrechnung.
// Alle Funktionen rechnen in lokaler Zeit; Wochen beginnen am Montag.

/** Date -> "2026-07-27" (ohne Zeitzonen-Verschiebung) */
export function isoDatum(d: Date): string {
  const jahr = d.getFullYear()
  const monat = String(d.getMonth() + 1).padStart(2, '0')
  const tag = String(d.getDate()).padStart(2, '0')
  return `${jahr}-${monat}-${tag}`
}

/** "2026-07-27" -> Date (lokale Mitternacht) */
export function ausIso(iso: string): Date {
  const [j, m, t] = iso.split('-').map(Number)
  return new Date(j, m - 1, t)
}

export function heuteIso(): string {
  return isoDatum(new Date())
}

/** Montag der Woche, in der das Datum liegt. */
export function wochenStart(d: Date): Date {
  const kopie = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const wochentag = (kopie.getDay() + 6) % 7 // Mo=0 … So=6
  kopie.setDate(kopie.getDate() - wochentag)
  return kopie
}

export function tagePlus(d: Date, tage: number): Date {
  const kopie = new Date(d)
  kopie.setDate(kopie.getDate() + tage)
  return kopie
}

export function monatePlus(d: Date, monate: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + monate, 1)
}

/**
 * Alle Tage, die im Monatsraster angezeigt werden: volle Wochen von Montag
 * bis Sonntag, inklusive der Randtage aus Vor- und Folgemonat.
 */
export function monatsRaster(jahr: number, monat: number): Date[] {
  const start = wochenStart(new Date(jahr, monat, 1))
  const tage: Date[] = []
  for (let i = 0; i < 42; i++) tage.push(tagePlus(start, i))
  // Letzte Zeile weglassen, wenn sie komplett im Folgemonat liegt.
  if (tage[35].getMonth() !== monat) tage.length = 35
  return tage
}

export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function monatsTitel(jahr: number, monat: number): string {
  return `${MONATE[monat]} ${jahr}`
}

/** "27.07. – 02.08.2026" */
export function wochenTitel(start: Date): string {
  const ende = tagePlus(start, 6)
  const kurz = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
  return `${kurz(start)} – ${kurz(ende)}${ende.getFullYear()}`
}

export function istHeute(d: Date): boolean {
  return isoDatum(d) === heuteIso()
}

export function istWochenende(d: Date): boolean {
  const t = d.getDay()
  return t === 0 || t === 6
}

/** Uhrzeit aus einem Zeitstempel: "09:15" */
export function uhrzeit(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
