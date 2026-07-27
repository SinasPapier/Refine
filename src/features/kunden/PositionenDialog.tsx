import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde, Position, Projekt } from '../../lib/types'
import { NAECHSTER_STATUS, POSITION_STATUS } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { useProfiles } from '../profile/ProfileProvider'
import { projektNummer } from './ProjekteDialog'
import StatusUrheber from '../../components/StatusUrheber'

/**
 * Die Bestandteile eines Projekts. Das Projekt bleibt die Abrechnungseinheit;
 * hier steht, was davon noch offen ist.
 */
export default function PositionenDialog({
  projekt,
  kunde,
  onSchliessen,
  onGeaendert,
}: {
  projekt: Projekt
  kunde: Kunde
  onSchliessen: () => void
  onGeaendert: () => void
}) {
  const toast = useToast()
  const { nameVon, farbeVon } = useProfiles()
  const [positionen, setPositionen] = useState<Position[]>([])
  const [bezeichnung, setBezeichnung] = useState('')

  const laden = useCallback(async () => {
    const { data } = await supabase
      .from('positionen')
      .select('*')
      .eq('projekt_id', projekt.id)
      .order('sortierung')
      .order('created_at')
    setPositionen((data as Position[]) ?? [])
  }, [projekt.id])

  useEffect(() => {
    laden()
  }, [laden])

  async function neu(e: FormEvent) {
    e.preventDefault()
    if (!bezeichnung.trim()) return
    const { error } = await supabase.from('positionen').insert({
      projekt_id: projekt.id,
      bezeichnung: bezeichnung.trim(),
      sortierung: positionen.length,
    })
    if (error) {
      toast('Position konnte nicht angelegt werden.', 'fehler')
      return
    }
    setBezeichnung('')
    await laden()
    onGeaendert()
  }

  async function statusWechseln(p: Position) {
    // erledigt_am, status_von und status_am setzt der Trigger in der Datenbank.
    await supabase
      .from('positionen')
      .update({ status: NAECHSTER_STATUS[p.status] })
      .eq('id', p.id)
    await laden()
    onGeaendert()
  }

  async function loeschen(p: Position) {
    if (!confirm(`Position „${p.bezeichnung}" löschen?`)) return
    await supabase.from('positionen').delete().eq('id', p.id)
    await laden()
    onGeaendert()
  }

  // Erledigte nach unten, damit oben steht, was noch ansteht.
  const sortiert = [...positionen].sort((a, b) => {
    const fertig = (p: Position) => (p.status === 'erledigt' ? 1 : 0)
    if (fertig(a) !== fertig(b)) return fertig(a) - fertig(b)
    return a.sortierung - b.sortierung
  })

  const offen = positionen.filter((p) => p.status !== 'erledigt').length
  const nummer = projektNummer(kunde, projekt)

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal breit" onClick={(e) => e.stopPropagation()}>
        <h2>
          {nummer && <code>{nummer}</code>} {projekt.name}
        </h2>
        <p className="muted small">
          Die einzelnen Bestandteile des Auftrags – zum Beispiel
          Visitenkarten, Beachflag, Flyer. Ein Klick auf den Status schaltet
          weiter: offen → in Arbeit → erledigt.
        </p>

        <form className="inline-form" onSubmit={neu}>
          <input
            placeholder="Neue Position…"
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={!bezeichnung.trim()}>
            Hinzufügen
          </button>
        </form>

        {sortiert.length === 0 ? (
          <p className="muted">
            Noch keine Positionen. Bei einem einteiligen Auftrag brauchst du auch
            keine.
          </p>
        ) : (
          <>
            <ul className="positionen-liste">
              {sortiert.map((p) => (
                <li key={p.id} className={p.status === 'erledigt' ? 'fertig' : ''}>
                  <button
                    className={`status-chip ${p.status}`}
                    onClick={() => statusWechseln(p)}
                    title="Status weiterschalten"
                  >
                    {POSITION_STATUS[p.status]}
                  </button>
                  <span className="positions-name">{p.bezeichnung}</span>
                  <StatusUrheber position={p} nameVon={nameVon} farbeVon={farbeVon} />
                  <button
                    className="btn-ghost small danger"
                    onClick={() => loeschen(p)}
                    aria-label="Position löschen"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small">
              {offen === 0
                ? 'Alles erledigt – das Projekt kann abgeschlossen werden.'
                : `${offen} von ${positionen.length} noch offen.`}
            </p>
          </>
        )}

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button className="btn-primary" onClick={onSchliessen}>
              Fertig
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
