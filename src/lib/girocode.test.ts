import { describe, expect, it } from 'vitest'
import {
  aufCentRunden,
  betragFormatieren,
  byteLaenge,
  giroCodePayload,
  giroCodePruefen,
  ibanPruefsummeStimmt,
  MAX_BYTES,
  verwendungszweckFuer,
} from './girocode'

/** Gültige Testdaten; einzelne Felder werden je Fall überschrieben. */
const basis = {
  empfaenger: 'Musteragentur GbR',
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  betrag: 450,
  verwendungszweck: 'Rechnung RS-2026-042',
}

describe('Zeilenstruktur', () => {
  it('hält Reihenfolge und Inhalt nach EPC069-12 ein', () => {
    const zeilen = giroCodePayload(basis).split('\n')
    expect(zeilen).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      'COBADEFFXXX',
      'Musteragentur GbR',
      'DE89370400440532013000',
      'EUR450.00',
      '',
      '',
      'Rechnung RS-2026-042',
    ])
  })

  it('lässt den BIC leer, wenn keiner hinterlegt ist', () => {
    const zeilen = giroCodePayload({ ...basis, bic: null }).split('\n')
    expect(zeilen[4]).toBe('')
    // Die Zeile bleibt erhalten, sonst verrutscht alles Folgende.
    expect(zeilen[5]).toBe('Musteragentur GbR')
    expect(zeilen).toHaveLength(11)
  })

  it('lässt Purpose Code und strukturierte Referenz leer', () => {
    const zeilen = giroCodePayload(basis).split('\n')
    expect(zeilen[8]).toBe('')
    expect(zeilen[9]).toBe('')
  })
})

describe('Betragsformat', () => {
  it.each([
    [450, 'EUR450.00'],
    [1234.5, 'EUR1234.50'],
    [0.01, 'EUR0.01'],
    [999999999.99, 'EUR999999999.99'],
    [7, 'EUR7.00'],
  ])('%s wird zu %s', (betrag, erwartet) => {
    expect(betragFormatieren(betrag)).toBe(erwartet)
  })

  it('benutzt einen Punkt und keine Tausenderzeichen', () => {
    const wert = betragFormatieren(1234567.89)
    expect(wert).toBe('EUR1234567.89')
    expect(wert).not.toContain(',')
  })

  it('rundet kaufmännisch auf Cent', () => {
    // Aus (60 € x 7 Min) / 60 entsteht so ein Wert in der Abrechnung.
    expect(betragFormatieren(7.004)).toBe('EUR7.00')
    expect(betragFormatieren(7.005)).toBe('EUR7.01')
    expect(aufCentRunden(16.666666666666668)).toBe(16.67)
  })
})

describe('Umlaute', () => {
  it('behält sie im Klartext und zählt sie in Byte', () => {
    const payload = giroCodePayload({ ...basis, empfaenger: 'Müller & Söhne GbR' })
    expect(payload.split('\n')[5]).toBe('Müller & Söhne GbR')
    // ü und ö brauchen in UTF-8 je zwei Byte.
    expect(byteLaenge('Müller & Söhne GbR')).toBe(20)
    expect('Müller & Söhne GbR'.length).toBe(18)
  })

  it('nimmt Umlaute auch im Verwendungszweck an', () => {
    const fehler = giroCodePruefen({
      ...basis,
      verwendungszweck: 'Rechnung RS-2026-042 – Gestaltung Broschüre',
    })
    expect(fehler).toEqual([])
  })
})

describe('IBAN', () => {
  it('erkennt gültige IBANs', () => {
    expect(ibanPruefsummeStimmt('DE89370400440532013000')).toBe(true)
    expect(ibanPruefsummeStimmt('de89 3704 0044 0532 0130 00')).toBe(true)
    expect(ibanPruefsummeStimmt('AT611904300234573201')).toBe(true)
    expect(ibanPruefsummeStimmt('CH9300762011623852957')).toBe(true)
  })

  it('erkennt eine falsche Prüfsumme', () => {
    // Letzte Ziffer verdreht – eine Länge, aber ungültig.
    expect(ibanPruefsummeStimmt('DE89370400440532013001')).toBe(false)
  })

  it('weist Unsinn ab', () => {
    expect(ibanPruefsummeStimmt('')).toBe(false)
    expect(ibanPruefsummeStimmt('DE89')).toBe(false)
    expect(ibanPruefsummeStimmt('1234567890')).toBe(false)
  })

  it('schreibt sie ohne Leerzeichen und groß in die Nutzdaten', () => {
    const zeilen = giroCodePayload({ ...basis, iban: 'de89 3704 0044 0532 0130 00' })
      .split('\n')
    expect(zeilen[6]).toBe('DE89370400440532013000')
  })

  it('meldet eine ungültige IBAN im Klartext', () => {
    const fehler = giroCodePruefen({ ...basis, iban: 'DE89370400440532013001' })
    expect(fehler).toHaveLength(1)
    expect(fehler[0].feld).toBe('iban')
    expect(fehler[0].text).toMatch(/ungültig/i)
  })
})

describe('Betragsgrenzen', () => {
  it('lehnt 0 ab und nennt den Grund', () => {
    const fehler = giroCodePruefen({ ...basis, betrag: 0 })
    expect(fehler).toHaveLength(1)
    expect(fehler[0].feld).toBe('betrag')
    expect(fehler[0].text).toMatch(/Gutschriften/)
  })

  it('lehnt negative Beträge ab', () => {
    expect(giroCodePruefen({ ...basis, betrag: -12.5 })[0].feld).toBe('betrag')
  })

  it('nimmt die Randwerte an', () => {
    expect(giroCodePruefen({ ...basis, betrag: 0.01 })).toEqual([])
    expect(giroCodePruefen({ ...basis, betrag: 999999999.99 })).toEqual([])
  })

  it('lehnt zu hohe Beträge ab', () => {
    expect(giroCodePruefen({ ...basis, betrag: 1000000000 })[0].feld).toBe('betrag')
  })
})

describe('Zeichengrenzen', () => {
  it('lässt genau 70 Zeichen Name zu, 71 nicht', () => {
    expect(giroCodePruefen({ ...basis, empfaenger: 'A'.repeat(70) })).toEqual([])
    const zuLang = giroCodePruefen({ ...basis, empfaenger: 'A'.repeat(71) })
    expect(zuLang[0].feld).toBe('empfaenger')
    expect(zuLang[0].text).toContain('71')
  })

  it('lässt genau 140 Zeichen Verwendungszweck zu, 141 nicht', () => {
    expect(giroCodePruefen({ ...basis, verwendungszweck: 'B'.repeat(140) })).toEqual([])
    expect(
      giroCodePruefen({ ...basis, verwendungszweck: 'B'.repeat(141) })[0].feld,
    ).toBe('verwendungszweck')
  })

  it('kürzt nichts stillschweigend', () => {
    const lang = 'C'.repeat(200)
    const payload = giroCodePayload({ ...basis, verwendungszweck: lang })
    expect(payload.split('\n')[10]).toHaveLength(200)
  })

  it('meldet fehlende Pflichtfelder einzeln', () => {
    const fehler = giroCodePruefen({
      empfaenger: '',
      iban: '',
      bic: '',
      betrag: 450,
      verwendungszweck: '',
    })
    expect(fehler.map((f) => f.feld).sort()).toEqual([
      'empfaenger',
      'iban',
      'verwendungszweck',
    ])
  })
})

describe('BIC', () => {
  it('nimmt 8 und 11 Zeichen an', () => {
    expect(giroCodePruefen({ ...basis, bic: 'COBADEFF' })).toEqual([])
    expect(giroCodePruefen({ ...basis, bic: 'COBADEFFXXX' })).toEqual([])
  })

  it('darf ganz fehlen', () => {
    expect(giroCodePruefen({ ...basis, bic: '' })).toEqual([])
    expect(giroCodePruefen({ ...basis, bic: null })).toEqual([])
  })

  it('meldet einen unsinnigen BIC', () => {
    expect(giroCodePruefen({ ...basis, bic: 'ABC' })[0].feld).toBe('bic')
  })
})

describe('Gesamtgröße', () => {
  it('bleibt bei üblichen Daten weit unter der Grenze', () => {
    expect(byteLaenge(giroCodePayload(basis))).toBeLessThan(MAX_BYTES)
  })

  it('meldet, wenn die 331 Byte überschritten werden', () => {
    // Name und Verwendungszweck je am Limit, dazu Umlaute mit zwei Byte.
    const fehler = giroCodePruefen({
      ...basis,
      empfaenger: 'Ü'.repeat(70),
      verwendungszweck: 'Ä'.repeat(140),
    })
    expect(fehler).toHaveLength(1)
    expect(fehler[0].feld).toBe('gesamt')
    expect(fehler[0].text).toContain('331')
  })
})

describe('Verwendungszweck aus der Rechnungsnummer', () => {
  it('setzt das Präfix davor', () => {
    expect(verwendungszweckFuer('RS-2026-042')).toBe('Rechnung RS-2026-042')
    expect(verwendungszweckFuer('  R-2026-0001  ')).toBe('Rechnung R-2026-0001')
  })

  it('bleibt leer, wenn keine Nummer da ist', () => {
    expect(verwendungszweckFuer('')).toBe('')
    expect(verwendungszweckFuer('   ')).toBe('')
  })
})
