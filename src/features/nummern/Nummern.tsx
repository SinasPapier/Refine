import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Nummernkreis, NummernLog, NummernTyp } from '../../lib/types'
import { NUMMERN_REIHENFOLGE } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { formatZeitstempel } from '../../lib/format'
import { useProfiles } from '../profile/ProfileProvider'

const LABELS: Record<NummernTyp, string> = {
  kunde: 'Kundennummer',
  rechnung: 'Rechnungsnummer',
  angebot: 'Angebotsnummer',
}

async function inZwischenablage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback für Browser ohne Clipboard-API
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

export default function Nummern() {
  const toast = useToast()
  const { nameVon, meinProfil } = useProfiles()
  const [kreise, setKreise] = useState<Nummernkreis[]>([])
  const [log, setLog] = useState<NummernLog[]>([])
  const [notiz, setNotiz] = useState('')
  const [busy, setBusy] = useState<NummernTyp | null>(null)
  const [letzte, setLetzte] = useState<string | null>(null)

  async function ladeLog() {
    const { data } = await supabase
      .from('nummern_log')
      .select('*')
      .order('erzeugt_am', { ascending: false })
      .limit(200)
    setLog((data as NummernLog[]) ?? [])
  }

  async function ladeKreise() {
    const { data } = await supabase.from('nummernkreise').select('*')
    // Feste Anzeigereihenfolge. Ohne sie bestimmt die Datenbank die Sortierung
    // und ein geänderter Datensatz rutscht ans Ende der Liste.
    const liste = ((data as Nummernkreis[]) ?? []).slice().sort(
      (a, b) => NUMMERN_REIHENFOLGE.indexOf(a.typ) - NUMMERN_REIHENFOLGE.indexOf(b.typ),
    )
    setKreise(liste)
  }

  useEffect(() => {
    ladeKreise()
    ladeLog()
  }, [])

  async function erzeuge(typ: NummernTyp) {
    setBusy(typ)
    const { data, error } = await supabase.rpc('next_nummer', {
      p_typ: typ,
      p_notiz: notiz.trim() || null,
    })
    setBusy(null)
    if (error || !data) {
      toast('Fehler beim Erzeugen der Nummer.', 'fehler')
      return
    }
    const nummer = data as string
    setLetzte(nummer)
    const kopiert = await inZwischenablage(nummer)
    toast(
      kopiert
        ? `${nummer} – in Zwischenablage kopiert`
        : `${nummer} erzeugt (Kopieren nicht möglich)`,
      kopiert ? 'ok' : 'fehler',
    )
    setNotiz('')
    ladeLog()
    ladeKreise()
  }

  return (
    <div>
      <h1>Nummern</h1>
      <p className="muted">
        Auf Knopfdruck die nächste fortlaufende Nummer erzeugen – sie wird
        automatisch in die Zwischenablage kopiert und unten dokumentiert.
      </p>

      <div className="card">
        <label>
          Notiz (optional, z.&nbsp;B. Kundenname) – wird mitprotokolliert
          <input
            type="text"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="z. B. Musterfirma GmbH"
          />
        </label>

        <div className="nummern-buttons">
          {(['kunde', 'rechnung', 'angebot'] as NummernTyp[]).map((typ) => (
            <button
              key={typ}
              className="btn-nummer"
              onClick={() => erzeuge(typ)}
              disabled={busy !== null}
            >
              <span className="btn-nummer-icon">📋</span>
              <span>{busy === typ ? 'Erzeuge…' : LABELS[typ]}</span>
              <span className="btn-nummer-hint">erzeugen &amp; kopieren</span>
            </button>
          ))}
        </div>

        {letzte && (
          <div className="letzte-nummer">
            Zuletzt erzeugt: <strong>{letzte}</strong>
          </div>
        )}
      </div>

      <Einstellungen
        kreise={kreise}
        istAdmin={meinProfil?.ist_admin ?? false}
        onGespeichert={ladeKreise}
      />

      <Dokumentation
        log={log}
        istAdmin={meinProfil?.ist_admin ?? false}
        nameVon={nameVon}
        onGeaendert={ladeLog}
      />
    </div>
  )
}

/** Ab hier wird nur noch angezeigt und gepflegt – erzeugt wird oben. */
const SICHTBAR = 10

function Dokumentation({
  log,
  istAdmin,
  nameVon,
  onGeaendert,
}: {
  log: NummernLog[]
  istAdmin: boolean
  nameVon: (id: string | null) => string
  onGeaendert: () => void
}) {
  const toast = useToast()
  const [alleZeigen, setAlleZeigen] = useState(false)

  // Nur die neuesten zeigen, damit die Seite nicht endlos wird.
  const aeltere = Math.max(0, log.length - SICHTBAR)
  const sichtbar = alleZeigen ? log : log.slice(0, SICHTBAR)

  async function loeschen(eintrag: NummernLog) {
    if (
      !confirm(
        `Eintrag ${eintrag.nummer} aus der Dokumentation löschen?\n\n` +
          'Die Nummer selbst bleibt vergeben und wird nicht erneut ausgegeben.',
      )
    )
      return
    const { error } = await supabase.from('nummern_log').delete().eq('id', eintrag.id)
    if (error) {
      toast('Löschen fehlgeschlagen.', 'fehler')
      return
    }
    toast(`${eintrag.nummer} aus der Dokumentation entfernt.`)
    onGeaendert()
  }

  if (log.length === 0) {
    return (
      <>
        <h2>Dokumentation</h2>
        <p className="muted">Noch keine Nummern erzeugt.</p>
      </>
    )
  }

  return (
    <>
      <h2>Dokumentation</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Typ</th>
              <th>Notiz</th>
              <th>Erstellt von</th>
              <th>Zeitpunkt</th>
              {istAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((eintrag) => (
              <tr key={eintrag.id}>
                <td className="nowrap">
                  <code>{eintrag.nummer}</code>
                </td>
                <td className="nowrap">{LABELS[eintrag.typ] ?? eintrag.typ}</td>
                <td>
                  <NotizFeld eintrag={eintrag} onGespeichert={onGeaendert} />
                </td>
                <td className="nowrap">{nameVon(eintrag.erzeugt_von)}</td>
                <td className="nowrap">{formatZeitstempel(eintrag.erzeugt_am)}</td>
                {istAdmin && (
                  <td className="spalte-aktionen">
                    <div className="aktionen">
                      <button
                        className="btn-ghost small danger"
                        onClick={() => loeschen(eintrag)}
                        aria-label={`Eintrag ${eintrag.nummer} löschen`}
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aeltere > 0 && (
        <button className="btn-ghost small" onClick={() => setAlleZeigen((a) => !a)}>
          {alleZeigen ? 'Ältere ausblenden' : `Ältere anzeigen (${aeltere})`}
        </button>
      )}
    </>
  )
}

/**
 * Die Notiz lässt sich nachtragen. Gespeichert wird beim Verlassen des Feldes
 * und nur, wenn sich wirklich etwas geändert hat.
 */
function NotizFeld({
  eintrag,
  onGespeichert,
}: {
  eintrag: NummernLog
  onGespeichert: () => void
}) {
  const toast = useToast()
  const [wert, setWert] = useState(eintrag.notiz ?? '')

  async function sichern() {
    const neu = wert.trim()
    if (neu === (eintrag.notiz ?? '')) return
    const { error } = await supabase
      .from('nummern_log')
      .update({ notiz: neu || null })
      .eq('id', eintrag.id)
    if (error) {
      toast('Notiz konnte nicht gespeichert werden.', 'fehler')
      setWert(eintrag.notiz ?? '')
      return
    }
    toast('Notiz gespeichert.')
    onGespeichert()
  }

  return (
    <input
      className="notiz-feld"
      value={wert}
      placeholder="Notiz ergänzen…"
      onChange={(e) => setWert(e.target.value)}
      onBlur={sichern}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setWert(eintrag.notiz ?? '')
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function Einstellungen({
  kreise,
  istAdmin,
  onGespeichert,
}: {
  kreise: Nummernkreis[]
  istAdmin: boolean
  onGespeichert: () => void
}) {
  const toast = useToast()
  const [offen, setOffen] = useState(false)

  async function speichere(typ: NummernTyp, felder: Partial<Nummernkreis>) {
    const { error } = await supabase.from('nummernkreise').update(felder).eq('typ', typ)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast('Format gespeichert.')
    onGespeichert()
  }

  return (
    <div className="card">
      <button className="collapse-head" onClick={() => setOffen((o) => !o)}>
        {offen ? '▾' : '▸'} Format und Zähler anpassen
      </button>
      {offen && !istAdmin && (
        <p className="muted small">
          Format und Zähler kann nur ein Administrator ändern – so bleibt die
          Nummernfolge verlässlich.
        </p>
      )}
      {offen && istAdmin && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Typ</th>
                <th>Präfix</th>
                <th>Mit Jahr</th>
                <th>Reset pro Jahr</th>
                <th>Stellen</th>
                <th>Zähler</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {kreise.map((k) => (
                <KreisZeile key={k.typ} kreis={k} onSpeichere={speichere} />
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Beispiel: Präfix <code>RE-</code>, „Mit Jahr" an und 4 Stellen ergibt{' '}
            <code>RE-2026-0001</code>. Der Zähler ist die zuletzt vergebene Nummer –
            die nächste erzeugte ist um eins höher.
          </p>
        </div>
      )}
    </div>
  )
}

function KreisZeile({
  kreis,
  onSpeichere,
}: {
  kreis: Nummernkreis
  onSpeichere: (typ: NummernTyp, felder: Partial<Nummernkreis>) => void
}) {
  const [praefix, setPraefix] = useState(kreis.praefix)
  const [mitJahr, setMitJahr] = useState(kreis.mit_jahr)
  const [reset, setReset] = useState(kreis.reset_pro_jahr)
  const [stellen, setStellen] = useState(kreis.stellen)
  const [zaehler, setZaehler] = useState(String(kreis.zaehler))

  const zaehlerZahl = parseInt(zaehler, 10)
  const zaehlerGueltig = Number.isFinite(zaehlerZahl) && zaehlerZahl >= 0

  // Speichern erst zulassen, wenn sich wirklich etwas unterscheidet.
  const veraendert =
    praefix !== kreis.praefix ||
    mitJahr !== kreis.mit_jahr ||
    reset !== kreis.reset_pro_jahr ||
    stellen !== kreis.stellen ||
    (zaehlerGueltig && zaehlerZahl !== kreis.zaehler)

  return (
    <tr>
      <td>{LABELS[kreis.typ]}</td>
      <td>
        <input className="mini" value={praefix} onChange={(e) => setPraefix(e.target.value)} />
      </td>
      <td>
        <input
          type="checkbox"
          checked={mitJahr}
          onChange={(e) => setMitJahr(e.target.checked)}
        />
      </td>
      <td>
        <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} />
      </td>
      <td>
        <input
          className="mini"
          type="number"
          min={1}
          max={8}
          value={stellen}
          onChange={(e) => setStellen(parseInt(e.target.value, 10) || 1)}
        />
      </td>
      <td>
        <input
          className="mini"
          type="number"
          min={0}
          value={zaehler}
          onChange={(e) => setZaehler(e.target.value)}
        />
      </td>
      <td>
        <button
          className="btn-ghost small"
          disabled={!veraendert || !zaehlerGueltig}
          title={!veraendert ? 'Es wurde nichts geändert' : undefined}
          onClick={() =>
            onSpeichere(kreis.typ, {
              praefix,
              mit_jahr: mitJahr,
              reset_pro_jahr: reset,
              stellen,
              zaehler: zaehlerZahl,
            })
          }
        >
          Speichern
        </button>
      </td>
    </tr>
  )
}
