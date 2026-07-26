import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Nummernkreis, NummernLog, NummernTyp } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { formatZeitstempel } from '../../lib/format'
import { useProfiles, nameVon } from '../profile/useProfiles'

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
  const { profiles } = useProfiles()
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
    setKreise((data as Nummernkreis[]) ?? [])
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

      <Einstellungen kreise={kreise} onGespeichert={ladeKreise} />

      <h2>Dokumentation</h2>
      {log.length === 0 ? (
        <p className="muted">Noch keine Nummern erzeugt.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Typ</th>
                <th>Notiz</th>
                <th>Erstellt von</th>
                <th>Zeitpunkt</th>
              </tr>
            </thead>
            <tbody>
              {log.map((eintrag) => (
                <tr key={eintrag.id}>
                  <td>
                    <code>{eintrag.nummer}</code>
                  </td>
                  <td>{LABELS[eintrag.typ] ?? eintrag.typ}</td>
                  <td>{eintrag.notiz ?? '—'}</td>
                  <td>{nameVon(profiles, eintrag.erzeugt_von)}</td>
                  <td>{formatZeitstempel(eintrag.erzeugt_am)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Einstellungen({
  kreise,
  onGespeichert,
}: {
  kreise: Nummernkreis[]
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
        {offen ? '▾' : '▸'} Format der Nummern anpassen
      </button>
      {offen && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Typ</th>
                <th>Präfix</th>
                <th>Mit Jahr</th>
                <th>Reset pro Jahr</th>
                <th>Stellen</th>
                <th>Aktueller Zähler</th>
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
            <code>RE-2026-0001</code>.
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

  return (
    <tr>
      <td>{LABELS[kreis.typ]}</td>
      <td>
        <input
          className="mini"
          value={praefix}
          onChange={(e) => setPraefix(e.target.value)}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={mitJahr}
          onChange={(e) => setMitJahr(e.target.checked)}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={reset}
          onChange={(e) => setReset(e.target.checked)}
        />
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
        {kreis.zaehler}
        <button
          className="btn-ghost small"
          style={{ marginLeft: 8 }}
          onClick={() =>
            onSpeichere(kreis.typ, {
              praefix,
              mit_jahr: mitJahr,
              reset_pro_jahr: reset,
              stellen,
            })
          }
        >
          Speichern
        </button>
      </td>
    </tr>
  )
}
