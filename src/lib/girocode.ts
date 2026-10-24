// GiroCode (EPC-QR-Code) für SEPA-Überweisungen.
//
// Erzeugt die Nutzdaten nach EPC069-12, Version 002. Bewusst ohne Bezug zur
// Oberfläche und ohne QR-Bibliothek: So lässt sich der heikle Teil – das
// Format – für sich testen, und das Zeichnen bleibt austauschbar.
//
// Aufbau der Zeilen, getrennt durch \n:
//   1  BCD          Kennung
//   2  002          Version
//   3  1            Zeichensatz UTF-8
//   4  SCT          SEPA Credit Transfer
//   5  BIC          optional, darf leer bleiben
//   6  Empfänger    max. 70 Zeichen
//   7  IBAN
//   8  Betrag       z. B. EUR450.00
//   9  Purpose      bleibt leer
//  10  Referenz     strukturiert – bleibt leer
//  11  Verwendung   unstrukturiert, max. 140 Zeichen
//
// Zeile 10 und 11 schließen sich gegenseitig aus; wir nutzen durchgehend die
// unstrukturierte Zeile 11. Leere Zeilen am Ende entfallen.

/** Grenzen aus der Spezifikation. */
export const MAX_NAME = 70
export const MAX_VERWENDUNGSZWECK = 140
export const MAX_BYTES = 331
export const MIN_BETRAG = 0.01
export const MAX_BETRAG = 999999999.99

export interface GiroCodeDaten {
  empfaenger: string
  iban: string
  /** Optional – in Version 002 darf der BIC fehlen. */
  bic?: string | null
  /** In Euro. Wird auf Cent gerundet. */
  betrag: number
  verwendungszweck: string
}

/** Ein Problem, das der Benutzer beheben kann – mit Feld und Klartext. */
export interface GiroCodeFehler {
  feld: 'empfaenger' | 'iban' | 'bic' | 'betrag' | 'verwendungszweck' | 'gesamt'
  text: string
}

/** Leerzeichen raus, Großbuchstaben – so steht die IBAN im QR-Code. */
export function ibanNormalisieren(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

/**
 * Prüfsumme nach ISO 7064 Mod 97-10.
 *
 * Die vier ersten Zeichen wandern ans Ende, Buchstaben werden zu Zahlen
 * (A=10 … Z=35), und der Rest der Division durch 97 muss 1 sein. Gerechnet
 * wird stückweise, weil die Zahl sonst für JavaScript zu groß wird.
 */
export function ibanPruefsummeStimmt(iban: string): boolean {
  const wert = ibanNormalisieren(iban)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(wert)) return false

  const umgestellt = wert.slice(4) + wert.slice(0, 4)
  let rest = 0
  for (const zeichen of umgestellt) {
    const ziffern = /[0-9]/.test(zeichen)
      ? zeichen
      : String(zeichen.charCodeAt(0) - 55) // 'A' (65) -> 10
    for (const z of ziffern) {
      rest = (rest * 10 + Number(z)) % 97
    }
  }
  return rest === 1
}

/**
 * Betrag als "EUR450.00".
 *
 * Punkt als Dezimaltrennzeichen, immer zwei Nachkommastellen, keine
 * Tausenderzeichen. Gerundet wird kaufmännisch auf Cent – und zwar über eine
 * Zwischenrundung, weil 1.005 als Fließkommazahl knapp unter 1.005 liegt und
 * sonst auf 1.00 statt 1.01 fiele.
 */
export function betragFormatieren(betrag: number): string {
  return `EUR${aufCentRunden(betrag).toFixed(2)}`
}

/** Kaufmännisch auf zwei Nachkommastellen. */
export function aufCentRunden(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * 100) / 100
}

/** Länge in Byte bei UTF-8 – maßgeblich ist die Byte-Zahl, nicht die Zeichen. */
export function byteLaenge(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Prüft die Eingaben und liefert alle Probleme auf einmal zurück – eine leere
 * Liste heißt: in Ordnung. Bewusst keine Ausnahme und kein stilles Kürzen,
 * damit die Oberfläche jedes Feld einzeln anmerken kann.
 */
export function giroCodePruefen(daten: GiroCodeDaten): GiroCodeFehler[] {
  const fehler: GiroCodeFehler[] = []
  const empfaenger = daten.empfaenger.trim()
  const verwendungszweck = daten.verwendungszweck.trim()
  const iban = ibanNormalisieren(daten.iban)
  const bic = (daten.bic ?? '').replace(/\s+/g, '').toUpperCase()

  if (!empfaenger) {
    fehler.push({ feld: 'empfaenger', text: 'Empfängername fehlt.' })
  } else if (empfaenger.length > MAX_NAME) {
    fehler.push({
      feld: 'empfaenger',
      text: `Empfängername ist ${empfaenger.length} Zeichen lang, erlaubt sind ${MAX_NAME}.`,
    })
  }

  if (!iban) {
    fehler.push({ feld: 'iban', text: 'IBAN fehlt.' })
  } else if (!ibanPruefsummeStimmt(iban)) {
    fehler.push({
      feld: 'iban',
      text: 'IBAN ist ungültig – bitte auf Tippfehler prüfen.',
    })
  }

  // In Version 002 ist der BIC freiwillig; wenn er dasteht, muss er passen.
  if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    fehler.push({ feld: 'bic', text: 'BIC ist ungültig (8 oder 11 Zeichen).' })
  }

  if (!Number.isFinite(daten.betrag)) {
    fehler.push({ feld: 'betrag', text: 'Betrag fehlt.' })
  } else {
    const betrag = aufCentRunden(daten.betrag)
    if (betrag < MIN_BETRAG) {
      fehler.push({
        feld: 'betrag',
        text: `Betrag muss mindestens ${MIN_BETRAG.toFixed(2).replace('.', ',')} € sein. Für Gutschriften gibt es keinen Zahlcode.`,
      })
    } else if (betrag > MAX_BETRAG) {
      fehler.push({ feld: 'betrag', text: 'Betrag ist zu hoch für einen Zahlcode.' })
    }
  }

  if (!verwendungszweck) {
    fehler.push({ feld: 'verwendungszweck', text: 'Verwendungszweck fehlt.' })
  } else if (verwendungszweck.length > MAX_VERWENDUNGSZWECK) {
    fehler.push({
      feld: 'verwendungszweck',
      text: `Verwendungszweck ist ${verwendungszweck.length} Zeichen lang, erlaubt sind ${MAX_VERWENDUNGSZWECK}.`,
    })
  }

  // Erst wenn die Einzelfelder stimmen, lohnt der Blick auf die Gesamtgröße.
  if (fehler.length === 0) {
    const groesse = byteLaenge(giroCodePayload(daten))
    if (groesse > MAX_BYTES) {
      fehler.push({
        feld: 'gesamt',
        text: `Der Zahlcode wäre ${groesse} Byte groß, erlaubt sind ${MAX_BYTES}. Bitte Empfängername oder Verwendungszweck kürzen.`,
      })
    }
  }

  return fehler
}

/**
 * Baut die Nutzdaten. Setzt gültige Eingaben voraus – vorher `giroCodePruefen`
 * aufrufen. Umlaute bleiben erhalten; der Zeichensatz in Zeile 3 sagt dem
 * Lesegerät, dass es UTF-8 ist.
 */
export function giroCodePayload(daten: GiroCodeDaten): string {
  const zeilen = [
    'BCD',
    '002',
    '1',
    'SCT',
    (daten.bic ?? '').replace(/\s+/g, '').toUpperCase(),
    daten.empfaenger.trim(),
    ibanNormalisieren(daten.iban),
    betragFormatieren(daten.betrag),
    '', // Purpose Code
    '', // strukturierte Referenz – schließt die unstrukturierte Zeile aus
    daten.verwendungszweck.trim(),
  ]

  // Leere Zeilen am Ende dürfen entfallen. Das betrifft hier nur den Fall
  // eines leeren Verwendungszwecks, spart aber Bytes und ist zulässig.
  while (zeilen.length > 0 && zeilen[zeilen.length - 1] === '') zeilen.pop()

  return zeilen.join('\n')
}

/** "Rechnung RS-2026-042" – der Verwendungszweck zu einer Rechnungsnummer. */
export function verwendungszweckFuer(rechnungsnummer: string): string {
  const nummer = rechnungsnummer.trim()
  return nummer ? `Rechnung ${nummer}` : ''
}
