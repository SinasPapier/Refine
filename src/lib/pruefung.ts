// Plausibilitätsprüfungen für Zeitbuchungen.
//
// Bewusst als Hinweis und nicht als Sperre: Ausnahmen soll die App erlauben,
// aber nicht unbemerkt durchgehen lassen.

import { formatDauer } from './format'
import { ausIso } from './datum'

/** Ab hier ist eine einzelne Buchung ungewöhnlich lang. */
export const MAX_PLAUSIBLE_MINUTEN = 16 * 60

/** Ein Zeiteintrag mehr als ein Jahr entfernt ist meist ein Vertipper. */
const MAX_TAGE_ABSTAND = 365

/**
 * Prüft Dauer und Datum einer Buchung.
 * Gibt einen Hinweistext zurück oder null, wenn alles unauffällig ist.
 */
export function pruefeBuchung(minuten: number, datumIso: string): string | null {
  if (minuten > MAX_PLAUSIBLE_MINUTEN) {
    return `${formatDauer(minuten)} an einem Tag – bitte kurz prüfen, ob die Dauer stimmt.`
  }

  const datum = ausIso(datumIso)
  if (Number.isNaN(datum.getTime())) return null

  const heute = new Date()
  const tage = Math.round(
    (new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()).getTime() -
      new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime()) /
      86400000,
  )

  if (tage > MAX_TAGE_ABSTAND) {
    return 'Das Datum liegt mehr als ein Jahr in der Zukunft – bitte kurz prüfen.'
  }
  if (tage < -MAX_TAGE_ABSTAND) {
    return 'Das Datum liegt mehr als ein Jahr zurück – bitte kurz prüfen.'
  }

  return null
}
