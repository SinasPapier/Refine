import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit } from '../../lib/types'
import { formatDatum, formatDauer } from '../../lib/format'
import { uhrzeit } from '../../lib/datum'
import { useAuth } from '../auth/useAuth'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import ZeitDialog from './ZeitDialog'
import AufteilenDialog from './AufteilenDialog'

export default function Zeiten() {
  const { session } = useAuth()
  const { profiles, nameVon, farbeVon } = useProfiles()
  const { aktiveProjekte, projektLabel, bezeichnungVon } = useStammdaten()

  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [dialog, setDialog] = useState<null | Arbeitszeit | 'neu'>(null)
  const [aufteilen, setAufteilen] = useState<Arbeitszeit | null>(null)

  const [filterPerson, setFilterPerson] = useState('')
  const [filterProjekt, setFilterProjekt] = useState('')
  const [filterVon, setFilterVon] = useState('')
  const [filterBis, setFilterBis] = useState('')

  const laden = useCallback(async () => {
    // Neuester Eintrag oben. Innerhalb eines Tages entscheidet die Startzeit;
    // von Hand erfasste Einträge haben keine und stehen daher dahinter, dort
    // sortiert der Anlagezeitpunkt. Ohne diese dritte Stufe stünden zwei
    // Handeinträge desselben Tages in beliebiger Reihenfolge.
    const { data } = await supabase
      .from('arbeitszeiten')
      .select('*')
      .order('datum', { ascending: false })
      .order('start_zeit', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500)
    setZeiten((data as Arbeitszeit[]) ?? [])
  }, [])

  useEffect(() => {
    laden()
  }, [laden])

  const gefiltert = useMemo(
    () =>
      zeiten.filter((z) => {
        if (filterPerson && z.gesellschafter_id !== filterPerson) return false
        if (filterProjekt && z.projekt_id !== filterProjekt) return false
        if (filterVon && z.datum < filterVon) return false
        if (filterBis && z.datum > filterBis) return false
        return true
      }),
    [zeiten, filterPerson, filterProjekt, filterVon, filterBis],
  )

  const summe = gefiltert.reduce((s, z) => s + z.dauer_minuten, 0)

  return (
    <div>
      <div className="seiten-kopf">
        <h1>Arbeitszeiten</h1>
        <button className="btn-primary" onClick={() => setDialog('neu')}>
          + Zeit erfassen
        </button>
      </div>
      <p className="muted">
        Für laufende Arbeit einfach oben die Stoppuhr starten – der Eintrag
        entsteht dann automatisch.
      </p>

      <div className="card">
        <div className="filter-row">
          <label>
            Person
            <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
              <option value="">Alle</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameVon(p.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Projekt
            <select value={filterProjekt} onChange={(e) => setFilterProjekt(e.target.value)}>
              <option value="">Alle</option>
              {aktiveProjekte.map((p) => (
                <option key={p.id} value={p.id}>
                  {projektLabel(p.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Von
            <input type="date" value={filterVon} onChange={(e) => setFilterVon(e.target.value)} />
          </label>
          <label>
            Bis
            <input type="date" value={filterBis} onChange={(e) => setFilterBis(e.target.value)} />
          </label>
        </div>

        <div className="summe-zeile">
          Summe: <strong>{formatDauer(summe)}</strong> ({gefiltert.length} Einträge)
        </div>

        {gefiltert.length === 0 ? (
          <p className="muted">Keine Einträge im gewählten Filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Person</th>
                  <th>Projekt</th>
                  <th>Beschreibung</th>
                  <th>Tätigkeit</th>
                  <th>Dauer</th>
                  <th>Betrag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((z) => {
                  const eigen = z.gesellschafter_id === session?.user.id
                  return (
                    <tr key={z.id}>
                      <td className="nowrap">
                        {formatDatum(z.datum)}
                        {uhrzeit(z.start_zeit) && (
                          <span className="muted small"> · {uhrzeit(z.start_zeit)}</span>
                        )}
                      </td>
                      <td>
                        <span
                          className="punkt"
                          style={{ background: farbeVon(z.gesellschafter_id) }}
                        />
                        {nameVon(z.gesellschafter_id)}
                      </td>
                      <td>{projektLabel(z.projekt_id)}</td>
                      <td className="spalte-text" title={z.beschreibung ?? ''}>
                        {z.beschreibung ?? '—'}
                      </td>
                      <td className="nowrap">
                        {z.taetigkeit ? (
                          bezeichnungVon(z.taetigkeit)
                        ) : (
                          <span className="muted">nicht zugeordnet</span>
                        )}
                      </td>
                      <td className="nowrap">{formatDauer(z.dauer_minuten)}</td>
                      <td className="nowrap">
                        {(((z.stundensatz ?? 0) * z.dauer_minuten) / 60).toLocaleString(
                          'de-DE',
                          { style: 'currency', currency: 'EUR' },
                        )}
                      </td>
                      <td className="spalte-aktionen">
                        <div className="aktionen">
                          {eigen && (
                            <>
                              <button className="btn-ghost small" onClick={() => setDialog(z)}>
                                Bearbeiten
                              </button>
                              <button
                                className="btn-ghost small"
                                onClick={() => setAufteilen(z)}
                                title="Auf mehrere Tätigkeiten aufteilen"
                              >
                                Aufteilen
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog && (
        <ZeitDialog
          eintrag={dialog === 'neu' ? null : dialog}
          onSchliessen={() => setDialog(null)}
          onGespeichert={laden}
        />
      )}

      {aufteilen && (
        <AufteilenDialog
          eintrag={aufteilen}
          onSchliessen={() => setAufteilen(null)}
          onGespeichert={laden}
        />
      )}
    </div>
  )
}
