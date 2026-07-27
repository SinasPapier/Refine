import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde, Position, Projekt } from '../../lib/types'
import { formatDatum } from '../../lib/format'
import { heuteIso } from '../../lib/datum'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import PositionenDialog from './PositionenDialog'

/** "K-00002-01" – aus der aktuellen Kundennummer zusammengesetzt. */
export function projektNummer(kunde: Kunde | null, projekt: Projekt): string | null {
  if (!kunde?.kundennummer || projekt.lfd_nummer == null) return null
  return `${kunde.kundennummer}-${String(projekt.lfd_nummer).padStart(2, '0')}`
}

/** "seit 20.03.2026" bzw. "20.03.2026 – 30.06.2026" */
function zeitraum(von: string, bis: string | null): string {
  return bis ? `${formatDatum(von)} – ${formatDatum(bis)}` : `seit ${formatDatum(von)}`
}

export default function ProjekteDialog({
  kunde,
  onSchliessen,
  onGeaendert,
}: {
  kunde: Kunde
  onSchliessen: () => void
  onGeaendert: () => void
}) {
  const toast = useToast()
  const { session } = useAuth()
  const { projekte } = useStammdaten()

  const [name, setName] = useState('')
  const [mitDeadline, setMitDeadline] = useState(false)
  const [deadline, setDeadline] = useState(heuteIso())
  const [speichert, setSpeichert] = useState(false)
  const [erledigt, setErledigt] = useState<Projekt | null>(null)
  const [positionenVon, setPositionenVon] = useState<Projekt | null>(null)
  const [positionen, setPositionen] = useState<Position[]>([])

  const eigene = projekte.filter((p) => p.kunde_id === kunde.id)

  /** Positionen aller Projekte dieses Kunden – für die Fortschrittsanzeige. */
  const positionenLaden = useCallback(async () => {
    const ids = projekte.filter((p) => p.kunde_id === kunde.id).map((p) => p.id)
    if (ids.length === 0) {
      setPositionen([])
      return
    }
    const { data } = await supabase.from('positionen').select('*').in('projekt_id', ids)
    setPositionen((data as Position[]) ?? [])
  }, [projekte, kunde.id])

  useEffect(() => {
    positionenLaden()
  }, [positionenLaden])

  async function neu(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !session) return
    setSpeichert(true)

    // Laufende Nummer je Kunde – die Datenbank vergibt sie unter Sperre.
    const { data: nr } = await supabase.rpc('next_projektnummer', { p_kunde_id: kunde.id })

    const { data: angelegt, error } = await supabase
      .from('projekte')
      .insert({ kunde_id: kunde.id, name: name.trim(), lfd_nummer: nr ?? null })
      .select()
      .single()

    if (error || !angelegt) {
      setSpeichert(false)
      toast('Projekt konnte nicht angelegt werden.', 'fehler')
      return
    }

    // Deadline direkt als Kalendereintrag anlegen.
    if (mitDeadline) {
      await supabase.from('termine').insert({
        titel: `${kunde.name}: ${name.trim()}`,
        datum: deadline,
        projekt_id: (angelegt as Projekt).id,
        erstellt_von: session.user.id,
      })
    }

    setSpeichert(false)
    toast(
      mitDeadline
        ? `Projekt angelegt, Deadline am ${formatDatum(deadline)} im Kalender.`
        : `Projekt „${name.trim()}" angelegt.`,
    )
    setName('')
    setMitDeadline(false)
    onGeaendert()
  }

  async function wiederOeffnen(p: Projekt) {
    await supabase
      .from('projekte')
      .update({ archiviert: false, erledigt_am: null })
      .eq('id', p.id)
    onGeaendert()
  }

  function fortschritt(projektId: string): { erledigt: number; gesamt: number } {
    const eigene = positionen.filter((pos) => pos.projekt_id === projektId)
    return {
      erledigt: eigene.filter((pos) => pos.status === 'erledigt').length,
      gesamt: eigene.length,
    }
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal breit" onClick={(e) => e.stopPropagation()}>
        <h2>Projekte von „{kunde.name}"</h2>
        <p className="muted small">
          Wofür wurdet ihr beauftragt? Zum Beispiel „Werbemittel Frühjahr". Die
          einzelnen Bestandteile – Visitenkarten, Beachflag, Flyer – legst du
          darin als Positionen an.
        </p>

        <form className="projekt-form" onSubmit={neu}>
          <input
            placeholder="Neues Projekt…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={mitDeadline}
              onChange={(e) => setMitDeadline(e.target.checked)}
            />
            Deadline
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={!mitDeadline}
            title={mitDeadline ? 'Erscheint im Kalender' : 'Ohne Deadline'}
          />
          <button className="btn-primary" type="submit" disabled={!name.trim() || speichert}>
            {speichert ? 'Legt an…' : 'Anlegen'}
          </button>
        </form>

        {eigene.length === 0 ? (
          <p className="muted">Noch keine Projekte für diesen Kunden.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Projekt</th>
                  <th>Angelegt / erledigt</th>
                  <th>Positionen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {eigene.map((p) => {
                  const f = fortschritt(p.id)
                  const nummer = projektNummer(kunde, p)
                  return (
                    <tr key={p.id}>
                      <td className="nowrap">
                        <code>{nummer ?? '—'}</code>
                      </td>
                      <td className={p.archiviert ? 'muted' : ''}>
                        {p.name}
                        {p.archiviert && <span className="tag-intern">erledigt</span>}
                      </td>
                      <td className="nowrap">{zeitraum(p.angelegt_am, p.erledigt_am)}</td>
                      <td className="nowrap">
                        <button className="btn-ghost small" onClick={() => setPositionenVon(p)}>
                          {f.gesamt === 0
                            ? '+ Positionen'
                            : `${f.erledigt} von ${f.gesamt} erledigt`}
                        </button>
                      </td>
                      <td className="spalte-aktionen">
                        <div className="aktionen">
                          {p.archiviert ? (
                            <button className="btn-ghost small" onClick={() => wiederOeffnen(p)}>
                              Wieder öffnen
                            </button>
                          ) : (
                            <button className="btn-ghost small" onClick={() => setErledigt(p)}>
                              ✓ Erledigt
                            </button>
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

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button className="btn-primary" onClick={onSchliessen}>
              Fertig
            </button>
          </div>
        </div>

        {positionenVon && (
          <PositionenDialog
            projekt={positionenVon}
            kunde={kunde}
            onSchliessen={() => setPositionenVon(null)}
            onGeaendert={positionenLaden}
          />
        )}

        {erledigt && (
          <ProjektErledigtDialog
            projekt={erledigt}
            offenePositionen={
              positionen.filter((pos) => pos.projekt_id === erledigt.id && pos.status !== 'erledigt')
                .length
            }
            onSchliessen={() => setErledigt(null)}
            onGespeichert={onGeaendert}
          />
        )}
      </div>
    </div>
  )
}

function ProjektErledigtDialog({
  projekt,
  offenePositionen,
  onSchliessen,
  onGespeichert,
}: {
  projekt: Projekt
  offenePositionen: number
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const toast = useToast()
  const [datum, setDatum] = useState(heuteIso())

  async function abschliessen() {
    const { error } = await supabase
      .from('projekte')
      .update({ archiviert: true, erledigt_am: datum })
      .eq('id', projekt.id)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast('Projekt als erledigt markiert.')
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>„{projekt.name}" als erledigt markieren</h2>
        <p className="muted small">
          Das Projekt verschwindet aus der Auswahl der Stoppuhr. Gebuchte Zeiten
          bleiben erhalten und behalten ihre Zuordnung.
        </p>

        {offenePositionen > 0 && (
          <div className="hinweis-warnung">
            {offenePositionen === 1
              ? 'Eine Position ist noch nicht erledigt.'
              : `${offenePositionen} Positionen sind noch nicht erledigt.`}{' '}
            Du kannst das Projekt trotzdem abschließen.
          </div>
        )}

        <label>
          Erledigungsdatum
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <div className="muted small">
          Leistungszeitraum: {formatDatum(projekt.angelegt_am)} – {formatDatum(datum)}
        </div>

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={abschliessen}>
              Als erledigt markieren
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
