import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, LaufendeZeit, Position, Termin } from '../../lib/types'
import { POSITION_STATUS } from '../../lib/types'
import { formatDauer } from '../../lib/format'
import { formatDatum } from '../../lib/format'
import { heuteIso, isoDatum } from '../../lib/datum'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import { projektNummer } from '../kunden/ProjekteDialog'

type Zeitraum = 'monat' | 'jahr' | 'alle'

export default function Dashboard() {
  const { profiles, nameVon, farbeVon } = useProfiles()
  const { kunden, kundeVonProjekt, projektLabel, projekte, terminSichtbar } =
    useStammdaten()
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [laufende, setLaufende] = useState<LaufendeZeit[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [positionen, setPositionen] = useState<Position[]>([])
  const [zeitraum, setZeitraum] = useState<Zeitraum>('monat')

  useEffect(() => {
    Promise.all([
      supabase.from('arbeitszeiten').select('*'),
      supabase.from('laufende_zeiten').select('*'),
      // Offene Deadlines ab heute, die nächsten zuerst. Bewusst mehr als die
      // angezeigten fünf: Deadlines erledigter Projekte fallen gleich noch
      // weg, sonst blieben am Ende weniger als fünf übrig.
      supabase
        .from('termine')
        .select('*')
        .eq('erledigt', false)
        .gte('datum', heuteIso())
        .order('datum')
        .limit(40),
      // Was steht noch an? Offene Positionen laufender Projekte.
      supabase.from('positionen').select('*').neq('status', 'erledigt'),
    ]).then(([z, l, t, pos]) => {
      setZeiten((z.data as Arbeitszeit[]) ?? [])
      setLaufende((l.data as LaufendeZeit[]) ?? [])
      setTermine((t.data as Termin[]) ?? [])
      setPositionen((pos.data as Position[]) ?? [])
    })
  }, [])

  const gefiltert = useMemo(() => {
    if (zeitraum === 'alle') return zeiten
    const jetzt = new Date()
    const grenze =
      zeitraum === 'monat'
        ? new Date(jetzt.getFullYear(), jetzt.getMonth(), 1)
        : new Date(jetzt.getFullYear(), 0, 1)
    const grenzeIso = isoDatum(grenze)
    return zeiten.filter((z) => z.datum >= grenzeIso)
  }, [zeiten, zeitraum])

  const gesamt = gefiltert.reduce((s, z) => s + z.dauer_minuten, 0)

  const proPerson = useMemo(() => {
    const map = new Map<string, number>()
    for (const z of gefiltert) {
      map.set(z.gesellschafter_id, (map.get(z.gesellschafter_id) ?? 0) + z.dauer_minuten)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [gefiltert])

  const proKunde = useMemo(() => {
    const map = new Map<string, number>()
    for (const z of gefiltert) {
      const key = kundeVonProjekt(z.projekt_id)?.id ?? '—'
      map.set(key, (map.get(key) ?? 0) + z.dauer_minuten)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [gefiltert, kundeVonProjekt])

  function kundeName(id: string): string {
    if (id === '—') return 'Ohne Projekt/Kunde'
    return kunden.find((k) => k.id === id)?.name ?? 'Unbekannt'
  }

  /** Deadlines erledigter oder entfernter Projekte gehören nicht mehr her. */
  const naechsteTermine = useMemo(
    () => termine.filter((t) => terminSichtbar(t.projekt_id)).slice(0, 5),
    [termine, terminSichtbar],
  )

  /**
   * Offene Positionen, gruppiert: aktiver Kunde → Projekt → Positionen.
   * Nur was wirklich offen ist – ein Kunde ohne offene Punkte taucht nicht auf.
   */
  const offeneGruppen = useMemo(() => {
    const jeProjekt = new Map<string, Position[]>()
    for (const pos of positionen) {
      const liste = jeProjekt.get(pos.projekt_id) ?? []
      liste.push(pos)
      jeProjekt.set(pos.projekt_id, liste)
    }

    return kunden
      .filter((k) => !k.archiviert)
      .map((kunde) => {
        const eigene = projekte
          .filter((p) => p.kunde_id === kunde.id && !p.archiviert)
          .map((projekt) => ({
            projekt,
            // Sortierung wie im Projektdialog, damit die Reihenfolge vertraut ist.
            positionen: (jeProjekt.get(projekt.id) ?? [])
              .slice()
              .sort((a, b) => a.sortierung - b.sortierung),
          }))
          .filter((p) => p.positionen.length > 0)
        const offen = eigene.reduce((s, p) => s + p.positionen.length, 0)
        return { kunde, projekte: eigene, offen }
      })
      .filter((g) => g.offen > 0)
  }, [kunden, projekte, positionen])

  const offenGesamt = offeneGruppen.reduce((s, g) => s + g.offen, 0)

  return (
    <div>
      <h1>Übersicht</h1>

      {laufende.length > 0 && (
        <div className="laeuft-gerade">
          {laufende.map((l) => (
            <span key={l.gesellschafter_id} className="laeuft-chip">
              <span className="puls" style={{ background: farbeVon(l.gesellschafter_id) }} />
              {nameVon(l.gesellschafter_id)} arbeitet gerade
            </span>
          ))}
        </div>
      )}

      <div className="segmented">
        {(['monat', 'jahr', 'alle'] as Zeitraum[]).map((z) => (
          <button
            key={z}
            className={zeitraum === z ? 'seg active' : 'seg'}
            onClick={() => setZeitraum(z)}
          >
            {z === 'monat' ? 'Dieser Monat' : z === 'jahr' ? 'Dieses Jahr' : 'Gesamt'}
          </button>
        ))}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Erfasste Zeit</div>
          <div className="kpi-value">{formatDauer(gesamt)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Einträge</div>
          <div className="kpi-value">{gefiltert.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kunden (aktiv)</div>
          <div className="kpi-value">{kunden.filter((k) => !k.archiviert).length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Gesellschafter</div>
          <div className="kpi-value">{profiles.length}</div>
        </div>
      </div>

      {naechsteTermine.length > 0 && (
        <div className="card">
          <h2>Nächste Deadlines</h2>
          <ul className="deadline-liste">
            {naechsteTermine.map((t) => (
              <li key={t.id}>
                <span className="deadline-datum">{formatDatum(t.datum)}</span>
                <span className="deadline-titel">{t.titel}</span>
                <span className="muted small">
                  {t.projekt_id ? projektLabel(t.projekt_id) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {offeneGruppen.length > 0 && (
        <div className="card">
          <h2>
            Was ist noch offen{' '}
            <span className="muted small">
              ({offenGesamt} {offenGesamt === 1 ? 'Punkt' : 'Punkte'})
            </span>
          </h2>
          {/* Zugeklappt gestartet, damit die Karte kurz bleibt; die Zahl rechts
              zeigt, ob sich das Aufklappen lohnt. */}
          <div className="offen-baum">
            {offeneGruppen.map((gruppe) => (
              <details key={gruppe.kunde.id} className="offen-kunde">
                <summary>
                  <span className="offen-name">{gruppe.kunde.name}</span>
                  <span className="offen-zahl">{gruppe.offen} offen</span>
                </summary>
                {gruppe.projekte.map(({ projekt, positionen: pos }) => (
                  <details key={projekt.id} className="offen-projekt">
                    <summary>
                      <span className="offen-name">
                        {projektNummer(gruppe.kunde, projekt) && (
                          <code>{projektNummer(gruppe.kunde, projekt)}</code>
                        )}{' '}
                        {projekt.name}
                      </span>
                      <span className="offen-zahl">{pos.length} offen</span>
                    </summary>
                    <ul className="offen-positionen">
                      {pos.map((p) => (
                        <li key={p.id}>
                          <span className={`status-chip ${p.status} klein`}>
                            {POSITION_STATUS[p.status]}
                          </span>
                          <span>{p.bezeichnung}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <h2>Stunden pro Person</h2>
          {proPerson.length === 0 ? (
            <p className="muted">Keine Daten.</p>
          ) : (
            <BalkenListe
              rows={proPerson.map(([id, min]) => ({
                label: nameVon(id),
                minuten: min,
                farbe: farbeVon(id),
              }))}
              max={gesamt}
            />
          )}
        </div>

        <div className="card">
          <h2>Stunden pro Kunde</h2>
          {proKunde.length === 0 ? (
            <p className="muted">Keine Daten.</p>
          ) : (
            <BalkenListe
              rows={proKunde.map(([id, min]) => ({ label: kundeName(id), minuten: min }))}
              max={gesamt}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function BalkenListe({
  rows,
  max,
}: {
  rows: { label: string; minuten: number; farbe?: string }[]
  max: number
}) {
  return (
    <ul className="balken-liste">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="balken-kopf">
            <span>{r.label}</span>
            <strong>{formatDauer(r.minuten)}</strong>
          </div>
          <div className="balken-track">
            <div
              className="balken-fill"
              style={{
                width: max > 0 ? `${(r.minuten / max) * 100}%` : '0%',
                background: r.farbe,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
