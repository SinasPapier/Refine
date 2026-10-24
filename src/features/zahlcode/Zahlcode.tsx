import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Firma, NummernLog } from '../../lib/types'
import {
  giroCodePayload,
  giroCodePruefen,
  verwendungszweckFuer,
  type GiroCodeFehler,
} from '../../lib/girocode'
import QrSvg, { qrSvgText } from '../../components/QrSvg'
import { useToast } from '../../components/Toast'

/** "450,00" oder "1.234,50" zu 1234.5 – deutsche Eingabe erlaubt. */
function betragLesen(eingabe: string): number {
  const bereinigt = eingabe.trim().replace(/\./g, '').replace(',', '.')
  if (!bereinigt) return NaN
  return Number(bereinigt)
}

export default function Zahlcode() {
  const toast = useToast()
  const [firma, setFirma] = useState<Firma | null>(null)
  const [laden, setLaden] = useState(true)
  const [nummern, setNummern] = useState<NummernLog[]>([])

  const [betragText, setBetragText] = useState('')
  const [rechnungsnummer, setRechnungsnummer] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('firma').select('*').eq('id', 1).maybeSingle(),
      // Die zuletzt erzeugten Rechnungsnummern als Auswahlhilfe.
      supabase
        .from('nummern_log')
        .select('*')
        .eq('typ', 'rechnung')
        .order('erzeugt_am', { ascending: false })
        .limit(10),
    ]).then(([f, n]) => {
      setFirma((f.data as Firma) ?? null)
      setNummern((n.data as NummernLog[]) ?? [])
      setLaden(false)
    })
  }, [])

  const betrag = betragLesen(betragText)
  const verwendungszweck = verwendungszweckFuer(rechnungsnummer)

  const daten = useMemo(
    () => ({
      empfaenger: firma?.empfaenger_name ?? '',
      iban: firma?.iban ?? '',
      bic: firma?.bic ?? '',
      betrag,
      verwendungszweck,
    }),
    [firma, betrag, verwendungszweck],
  )

  // Erst prüfen, wenn überhaupt etwas eingegeben wurde – sonst stünde die
  // Seite beim Öffnen voller roter Meldungen.
  const etwasEingegeben = betragText.trim() !== '' || rechnungsnummer.trim() !== ''
  const fehler: GiroCodeFehler[] = useMemo(
    () => (firma ? giroCodePruefen(daten) : []),
    [firma, daten],
  )
  const fertig = etwasEingegeben && fehler.length === 0
  const payload = fertig ? giroCodePayload(daten) : ''

  function meldung(feld: GiroCodeFehler['feld']): string | null {
    return fehler.find((f) => f.feld === feld)?.text ?? null
  }

  const firmaFehlt = !laden && (!firma?.empfaenger_name?.trim() || !firma?.iban?.trim())

  function herunterladen() {
    const svg = qrSvgText(payload)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `girocode-${rechnungsnummer.trim() || 'rechnung'}.svg`
    a.click()
    URL.revokeObjectURL(url)
    toast('SVG heruntergeladen.')
  }

  if (laden) return <div className="center-hint">Lädt…</div>

  return (
    <div>
      <h1>Zahlcode</h1>
      <p className="muted">
        Erzeugt einen GiroCode für deine Rechnung. Der Kunde scannt ihn mit
        seiner Banking-App, die Überweisung ist dann ausgefüllt. Lade den Code
        als SVG herunter und setze ihn in dein Rechnungsdokument ein.
      </p>

      {firmaFehlt ? (
        <div className="card">
          <div className="hinweis-warnung">
            Es fehlen noch Empfängername und IBAN. Ein Administrator trägt sie
            unter <strong>Einstellungen → Firma &amp; Bankverbindung</strong>{' '}
            ein. Danach lässt sich hier ein Zahlcode erzeugen.
          </div>
        </div>
      ) : (
        <div className="zahlcode-raster">
          <div className="card">
            <h2>Angaben</h2>

            <label>
              Rechnungsbetrag in Euro
              <input
                inputMode="decimal"
                placeholder="z. B. 450,00"
                value={betragText}
                onChange={(e) => setBetragText(e.target.value)}
                autoFocus
              />
            </label>
            {etwasEingegeben && meldung('betrag') && (
              <div className="fehler">{meldung('betrag')}</div>
            )}

            <label>
              Rechnungsnummer
              <input
                list="rechnungsnummern"
                placeholder="z. B. RE-2026-0042"
                value={rechnungsnummer}
                onChange={(e) => setRechnungsnummer(e.target.value)}
              />
            </label>
            <datalist id="rechnungsnummern">
              {nummern.map((n) => (
                <option key={n.id} value={n.nummer}>
                  {n.notiz ?? ''}
                </option>
              ))}
            </datalist>
            {etwasEingegeben && meldung('verwendungszweck') && (
              <div className="fehler">{meldung('verwendungszweck')}</div>
            )}

            <p className="muted small">
              Als Verwendungszweck steht im Code:{' '}
              {verwendungszweck ? <code>{verwendungszweck}</code> : '—'}
            </p>

            <div className="zahlcode-empfaenger">
              <div>
                <span className="muted small">Empfänger</span>
                <div>{firma?.empfaenger_name}</div>
              </div>
              <div>
                <span className="muted small">IBAN</span>
                <div>
                  <code>{firma?.iban}</code>
                </div>
              </div>
              {firma?.bic?.trim() && (
                <div>
                  <span className="muted small">BIC</span>
                  <div>
                    <code>{firma.bic}</code>
                  </div>
                </div>
              )}
            </div>

            {/* Fehler an den Firmendaten kann der Benutzer hier nicht beheben –
                deshalb mit dem Hinweis, wo sie stehen. */}
            {(meldung('empfaenger') || meldung('iban') || meldung('bic')) && (
              <div className="fehler">
                {meldung('empfaenger') ?? meldung('iban') ?? meldung('bic')} Zu
                ändern unter Einstellungen → Firma &amp; Bankverbindung.
              </div>
            )}
            {meldung('gesamt') && <div className="fehler">{meldung('gesamt')}</div>}
          </div>

          <div className="card zahlcode-vorschau">
            <h2>Zahlcode</h2>
            {fertig ? (
              <>
                <div className="qr-rahmen">
                  <QrSvg text={payload} titel="GiroCode zur Rechnung" />
                </div>
                <p className="qr-beschriftung">
                  Bezahlen mit Code – mit Banking-App scannen
                </p>
                <button className="btn-primary" onClick={herunterladen}>
                  GiroCode herunterladen (SVG)
                </button>
                <details className="qr-rohdaten">
                  <summary>Inhalt des Codes</summary>
                  <pre>{payload}</pre>
                </details>
              </>
            ) : (
              <p className="muted">
                Betrag und Rechnungsnummer eingeben – der Code erscheint dann
                hier.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
