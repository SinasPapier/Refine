import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, Termin } from '../../lib/types'
import { formatDauer } from '../../lib/format'
import {
  isoDatum,
  monatePlus,
  monatsRaster,
  monatsTitel,
  tagePlus,
  uhrzeit,
  wochenStart,
  wochenTitel,
  WOCHENTAGE,
  istHeute,
  istWochenende,
  heuteIso,
} from '../../lib/datum'
import { useAuth } from '../auth/useAuth'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import ZeitDialog from '../zeiten/ZeitDialog'
import TerminDialog from './TerminDialog'

type Ansicht = 'monat' | 'woche'

export default function Kalender() {
  const { session } = useAuth()
  const { profiles, nameVon, farbeVon } = useProfiles()
  const { projektLabel, projektName } = useStammdaten()

  const [ansicht, setAnsicht] = useState<Ansicht>('monat')
  const [anker, setAnker] = useState(() => new Date())
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [nurPerson, setNurPerson] = useState<string>('')
  const [gewaehlterTag, setGewaehlterTag] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { eintrag: Arbeitszeit | null; datum: string }>(
    null,
  )
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
    const [{ data: z }, { data: t }] = await Promise.all([
      supabase.from('arbeitszeiten').select('*').gte('datum', vonIso).lte('datum', bisIso),
      supabase
        .from('termine')
        .select('*')
        .gte('datum', vonIso)
        .lte('datum', bisIso)
        .order('datum'),
    ])
    setZeiten((z as Arbeitszeit[]) ?? [])
    setTermine((t as Termin[]) ?? [])
  }, [vonIso, bisIso])

  useEffect(() => {
    laden()
  }, [laden])

  const gefiltert = useMemo(
    () => (nurPerson ? zeiten.filter((z) => z.gesellschafter_id === nurPerson) : zeiten),
    [zeiten, nurPerson],
  )

  /** Einträge je Tag, absteigend nach Dauer für eine ruhige Darstellung. */
  const proTag = useMemo(() => {
    const map = new Map<string, Arbeitszeit[]>()
    for (const z of gefiltert) {
      const liste = map.get(z.datum) ?? []
      liste.push(z)
      map.set(z.datum, liste)
    }
    for (const liste of map.values()) {
      liste.sort((a, b) => {
        if (a.start_zeit && b.start_zeit) return a.start_zeit.localeCompare(b.start_zeit)
        return b.dauer_minuten - a.dauer_minuten
      })
    }
    return map
  }, [gefiltert])

  /** Deadlines je Tag – unabhängig vom Personenfilter, sie gehören dem Team. */
  const termineProTag = useMemo(() => {
    const map = new Map<string, Termin[]>()
    for (const t of termine) {
      const liste = map.get(t.datum) ?? []
      liste.push(t)
      map.set(t.datum, liste)
    }
    return map
  }, [termine])

  function summeTag(iso: string): number {
    return (proTag.get(iso) ?? []).reduce((s, z) => s + z.dauer_minuten, 0)
  }

  const gesamt = gefiltert.reduce((s, z) => s + z.dauer_minuten, 0)

  function blaettern(richtung: -1 | 1) {
    setGewaehlterTag(null)
    setAnker((a) => (ansicht === 'monat' ? monatePlus(a, richtung) : tagePlus(a, richtung * 7)))
  }

  const titel =
    ansicht === 'monat'
      ? monatsTitel(anker.getFullYear(), anker.getMonth())
      : wochenTitel(wochenStart(anker))

  const tagDetails = gewaehlterTag ? proTag.get(gewaehlterTag) ?? [] : []

  return (
    <div>
      <h1>Kalender</h1>

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

      <div className="kal-legende">
        <button
          className={nurPerson === '' ? 'person-chip alle aktiv' : 'person-chip alle'}
          onClick={() => setNurPerson('')}
        >
          Alle
        </button>
        {profiles.map((p) => (
          <button
            key={p.id}
            className={nurPerson === p.id ? 'person-chip aktiv' : 'person-chip'}
            style={{ background: p.farbe || '#4f46e5' }}
            onClick={() => setNurPerson(nurPerson === p.id ? '' : p.id)}
          >
            {nameVon(p.id)}
          </button>
        ))}
        <span className="kal-summe">Summe: {formatDauer(gesamt)}</span>
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
            const eintraege = proTag.get(iso) ?? []
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
            return (
              <button
                key={iso}
                className={klassen}
                onClick={() => setGewaehlterTag(gewaehlterTag === iso ? null : iso)}
              >
                <div className="kal-zelle-kopf">
                  <span className="kal-tagzahl">{tag.getDate()}</span>
                  {eintraege.length > 0 && (
                    <span className="kal-tagsumme">{formatDauer(summeTag(iso))}</span>
                  )}
                </div>
                <div className="kal-eintraege">
                  {(termineProTag.get(iso) ?? []).map((t) => (
                    <span
                      key={t.id}
                      className={`kal-deadline${t.erledigt ? ' erledigt' : ''}${
                        !t.erledigt && iso < heuteIso() ? ' ueberfaellig' : ''
                      }`}
                      title={`Deadline: ${t.titel}`}
                    >
                      🚩 {t.titel}
                    </span>
                  ))}
                  {eintraege.slice(0, 3).map((z) => (
                    <span
                      key={z.id}
                      className="kal-balken"
                      style={{ background: farbeVon(z.gesellschafter_id) }}
                      title={`${nameVon(z.gesellschafter_id)} · ${projektLabel(z.projekt_id)} · ${formatDauer(z.dauer_minuten)}`}
                    >
                      {projektName(z.projekt_id)}
                    </span>
                  ))}
                  {eintraege.length > 3 && (
                    <span className="kal-mehr">+{eintraege.length - 3} weitere</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="kal-woche">
          {tage.map((tag) => {
            const iso = isoDatum(tag)
            const eintraege = proTag.get(iso) ?? []
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
                  <strong>{eintraege.length ? formatDauer(summeTag(iso)) : '—'}</strong>
                </div>
                <div className="kal-spalte-inhalt">
                  {(termineProTag.get(iso) ?? []).map((t) => (
                    <button
                      key={t.id}
                      className={`kal-deadline-karte${t.erledigt ? ' erledigt' : ''}${
                        !t.erledigt && iso < heuteIso() ? ' ueberfaellig' : ''
                      }`}
                      onClick={() => setTerminDialog({ termin: t, datum: t.datum })}
                    >
                      🚩 {t.titel}
                    </button>
                  ))}
                  {eintraege.map((z) => (
                    <button
                      key={z.id}
                      className="kal-karte"
                      style={{ borderLeftColor: farbeVon(z.gesellschafter_id) }}
                      onClick={() =>
                        z.gesellschafter_id === session?.user.id
                          ? setDialog({ eintrag: z, datum: z.datum })
                          : undefined
                      }
                      title={
                        z.gesellschafter_id === session?.user.id
                          ? 'Zum Bearbeiten klicken'
                          : `Eintrag von ${nameVon(z.gesellschafter_id)}`
                      }
                    >
                      <div className="kal-karte-kopf">
                        <strong>{formatDauer(z.dauer_minuten)}</strong>
                        {uhrzeit(z.start_zeit) && (
                          <span className="muted small">{uhrzeit(z.start_zeit)}</span>
                        )}
                      </div>
                      <div className="kal-karte-projekt">{projektLabel(z.projekt_id)}</div>
                      {z.beschreibung && (
                        <div className="kal-karte-text">{z.beschreibung}</div>
                      )}
                      <div className="kal-karte-person">{nameVon(z.gesellschafter_id)}</div>
                    </button>
                  ))}
                  <button
                    className="kal-plus"
                    onClick={() => setDialog({ eintrag: null, datum: iso })}
                  >
                    + Zeit
                  </button>
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
            <div className="aktionen">
              <button
                className="btn-ghost small"
                onClick={() => setDialog({ eintrag: null, datum: gewaehlterTag })}
              >
                + Zeit erfassen
              </button>
              <button
                className="btn-ghost small"
                onClick={() => setTerminDialog({ termin: null, datum: gewaehlterTag })}
              >
                🚩 + Deadline
              </button>
            </div>
          </div>

          {(termineProTag.get(gewaehlterTag) ?? []).length > 0 && (
            <ul className="tag-liste deadlines">
              {(termineProTag.get(gewaehlterTag) ?? []).map((t) => (
                <li key={t.id}>
                  <span>🚩</span>
                  <span className={t.erledigt ? 'durchgestrichen' : ''}>{t.titel}</span>
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

          {tagDetails.length === 0 ? (
            <p className="muted">Keine Einträge an diesem Tag.</p>
          ) : (
            <ul className="tag-liste">
              {tagDetails.map((z) => {
                const eigen = z.gesellschafter_id === session?.user.id
                return (
                  <li key={z.id}>
                    <span
                      className="punkt"
                      style={{ background: farbeVon(z.gesellschafter_id) }}
                    />
                    <span className="tag-person">{nameVon(z.gesellschafter_id)}</span>
                    <span className="tag-projekt">{projektLabel(z.projekt_id)}</span>
                    <span className="tag-text muted">{z.beschreibung ?? ''}</span>
                    <strong>{formatDauer(z.dauer_minuten)}</strong>
                    {eigen && (
                      <button
                        className="btn-ghost small"
                        onClick={() => setDialog({ eintrag: z, datum: z.datum })}
                      >
                        Bearbeiten
                      </button>
                    )}
                  </li>
                )
              })}
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

      {dialog && (
        <ZeitDialog
          eintrag={dialog.eintrag}
          vorgabeDatum={dialog.datum ?? heuteIso()}
          onSchliessen={() => setDialog(null)}
          onGespeichert={laden}
        />
      )}
    </div>
  )
}
