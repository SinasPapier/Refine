import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Termin } from '../../lib/types'
import {
  isoDatum,
  monatePlus,
  monatsRaster,
  monatsTitel,
  tagePlus,
  wochenStart,
  wochenTitel,
  WOCHENTAGE,
  istHeute,
  istWochenende,
  heuteIso,
} from '../../lib/datum'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import TerminDialog from './TerminDialog'

type Ansicht = 'monat' | 'woche'

/**
 * Reiner Deadline-Kalender. Die erfassten Arbeitszeiten stehen bewusst nicht
 * hier, sondern im Reiter „Arbeitszeiten" – der Kalender beantwortet die Frage
 * „was steht an?", nicht „wer hat wann gearbeitet?".
 */
export default function Kalender() {
  const { projektLabel, terminSichtbar } = useStammdaten()

  const [ansicht, setAnsicht] = useState<Ansicht>('monat')
  const [anker, setAnker] = useState(() => new Date())
  const [gewaehlterTag, setGewaehlterTag] = useState<string | null>(null)
  const [termine, setTermine] = useState<Termin[]>([])
  const [terminDialog, setTerminDialog] = useState<
    null | { termin: Termin | null; datum: string }
  >(null)

  // Sichtbarer Zeitraum je nach Ansicht
  const tage = useMemo(() => {
    if (ansicht === 'monat') return monatsRaster(anker.getFullYear(), anker.getMonth())
    const start = wochenStart(anker)
    return Array.from({ length: 7 }, (_, i) => tagePlus(start, i))
  }, [ansicht, anker])

  const vonIso = isoDatum(tage[0])
  const bisIso = isoDatum(tage[tage.length - 1])

  const laden = useCallback(async () => {
    const { data } = await supabase
      .from('termine')
      .select('*')
      .gte('datum', vonIso)
      .lte('datum', bisIso)
      .order('datum')
    setTermine((data as Termin[]) ?? [])
  }, [vonIso, bisIso])

  useEffect(() => {
    laden()
  }, [laden])

  /** Deadlines je Tag. Erledigte und entfernte Projekte fallen raus. */
  const termineProTag = useMemo(() => {
    const map = new Map<string, Termin[]>()
    for (const t of termine) {
      if (!terminSichtbar(t.projekt_id)) continue
      const liste = map.get(t.datum) ?? []
      liste.push(t)
      map.set(t.datum, liste)
    }
    return map
  }, [termine, terminSichtbar])

  const anzahlSichtbar = useMemo(
    () => [...termineProTag.values()].reduce((s, l) => s + l.length, 0),
    [termineProTag],
  )

  function blaettern(richtung: -1 | 1) {
    setGewaehlterTag(null)
    setAnker((a) => (ansicht === 'monat' ? monatePlus(a, richtung) : tagePlus(a, richtung * 7)))
  }

  const titel =
    ansicht === 'monat'
      ? monatsTitel(anker.getFullYear(), anker.getMonth())
      : wochenTitel(wochenStart(anker))

  /** Zusatzklasse für überfällig/erledigt – in beiden Ansichten gleich. */
  function zustand(t: Termin, iso: string): string {
    if (t.erledigt) return ' erledigt'
    return iso < heuteIso() ? ' ueberfaellig' : ''
  }

  return (
    <div>
      <h1>Kalender</h1>
      <p className="muted">
        Alle Deadlines des Teams. Erfasste Arbeitszeiten stehen im Reiter
        „Arbeitszeiten".
      </p>

      <div className="kal-kopf">
        <div className="kal-navigation">
          <button className="btn-ghost small" onClick={() => blaettern(-1)} aria-label="Zurück">
            ◀
          </button>
          <span className="kal-titel">{titel}</span>
          <button className="btn-ghost small" onClick={() => blaettern(1)} aria-label="Vor">
            ▶
          </button>
          <button
            className="btn-ghost small"
            onClick={() => {
              setAnker(new Date())
              setGewaehlterTag(null)
            }}
          >
            Heute
          </button>
        </div>

        <div className="segmented">
          {(['monat', 'woche'] as Ansicht[]).map((a) => (
            <button
              key={a}
              className={ansicht === a ? 'seg active' : 'seg'}
              onClick={() => {
                setAnsicht(a)
                setGewaehlterTag(null)
              }}
            >
              {a === 'monat' ? 'Monat' : 'Woche'}
            </button>
          ))}
        </div>
      </div>

      {ansicht === 'monat' ? (
        <div className="kal-monat">
          {WOCHENTAGE.map((w) => (
            <div key={w} className="kal-wochentag">
              {w}
            </div>
          ))}
          {tage.map((tag) => {
            const iso = isoDatum(tag)
            const fremderMonat = tag.getMonth() !== anker.getMonth()
            const klassen = [
              'kal-zelle',
              fremderMonat ? 'fremd' : '',
              istHeute(tag) ? 'heute' : '',
              istWochenende(tag) ? 'wochenende' : '',
              gewaehlterTag === iso ? 'gewaehlt' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const auswaehlen = () => setGewaehlterTag(gewaehlterTag === iso ? null : iso)
            return (
              // Bewusst ein div statt eines Knopfes: Die Deadlines darin sind
              // selbst Knöpfe, und ein Knopf im Knopf ist in HTML nicht erlaubt.
              // Genau daran scheiterte bisher der Klick auf eine Deadline.
              <div
                key={iso}
                className={klassen}
                role="button"
                tabIndex={0}
                onClick={auswaehlen}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    auswaehlen()
                  }
                }}
              >
                <div className="kal-zelle-kopf">
                  <span className="kal-tagzahl">{tag.getDate()}</span>
                </div>
                <div className="kal-eintraege">
                  {(termineProTag.get(iso) ?? []).map((t) => (
                    <button
                      key={t.id}
                      className={`kal-deadline${zustand(t, iso)}`}
                      title={`Deadline: ${t.titel} – zum Bearbeiten klicken`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setTerminDialog({ termin: t, datum: t.datum })
                      }}
                    >
                      🚩 {t.titel}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="kal-woche">
          {tage.map((tag) => {
            const iso = isoDatum(tag)
            const eintraege = termineProTag.get(iso) ?? []
            return (
              <div
                key={iso}
                className={`kal-wochentag-spalte${istHeute(tag) ? ' heute' : ''}${
                  istWochenende(tag) ? ' wochenende' : ''
                }`}
              >
                <div className="kal-spalte-kopf">
                  <span>
                    {WOCHENTAGE[(tag.getDay() + 6) % 7]} {tag.getDate()}.
                  </span>
                  <strong>{eintraege.length ? `${eintraege.length} 🚩` : '—'}</strong>
                </div>
                <div className="kal-spalte-inhalt">
                  {eintraege.map((t) => (
                    <button
                      key={t.id}
                      className={`kal-deadline-karte${zustand(t, iso)}`}
                      onClick={() => setTerminDialog({ termin: t, datum: t.datum })}
                    >
                      🚩 {t.titel}
                    </button>
                  ))}
                  <button
                    className="kal-plus deadline"
                    onClick={() => setTerminDialog({ termin: null, datum: iso })}
                  >
                    + Deadline
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {anzahlSichtbar === 0 && (
        <p className="muted">In diesem Zeitraum steht keine Deadline an.</p>
      )}

      {gewaehlterTag && (
        <div className="card">
          <div className="tag-detail-kopf">
            <h2>
              {new Date(gewaehlterTag).toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </h2>
            <button
              className="btn-ghost small"
              onClick={() => setTerminDialog({ termin: null, datum: gewaehlterTag })}
            >
              🚩 + Deadline
            </button>
          </div>

          {(termineProTag.get(gewaehlterTag) ?? []).length === 0 ? (
            <p className="muted">Keine Deadline an diesem Tag.</p>
          ) : (
            <ul className="tag-liste deadlines">
              {(termineProTag.get(gewaehlterTag) ?? []).map((t) => (
                <li key={t.id}>
                  <span>🚩</span>
                  <span className={t.erledigt ? 'durchgestrichen' : ''}>{t.titel}</span>
                  <span className="tag-projekt">
                    {t.projekt_id ? projektLabel(t.projekt_id) : ''}
                  </span>
                  <span className="tag-text muted">{t.beschreibung ?? ''}</span>
                  <button
                    className="btn-ghost small"
                    onClick={() => setTerminDialog({ termin: t, datum: t.datum })}
                  >
                    Bearbeiten
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {terminDialog && (
        <TerminDialog
          termin={terminDialog.termin}
          vorgabeDatum={terminDialog.datum}
          onSchliessen={() => setTerminDialog(null)}
          onGespeichert={laden}
        />
      )}
    </div>
  )
}
