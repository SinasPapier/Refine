import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, LaufendeZeit } from '../../lib/types'
import { formatDauer } from '../../lib/format'
import { formatDatum } from '../../lib/format'
import { heuteIso, isoDatum, uhrzeit, wochenStart } from '../../lib/datum'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import { WARNGRENZE_MINUTEN } from '../timer/Timer'

/** Laufende Uhr als hh:mm:ss. */
function stoppuhrAnzeige(sekunden: number): string {
  const zwei = (n: number) => String(n).padStart(2, '0')
  return `${zwei(Math.floor(sekunden / 3600))}:${zwei(
    Math.floor((sekunden % 3600) / 60),
  )}:${zwei(sekunden % 60)}`
}

/** "heute", "gestern", "vor 3 Tagen" – für Statusmeldung und letzte Aktivität. */
function relativerTag(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const heute = new Date()
  const tage = Math.round(
    (new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000,
  )
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} Tagen`
  return formatDatum(iso)
}

export default function Team() {
  const { session } = useAuth()
  const { profiles, nameVon, farbeVon, neuLaden } = useProfiles()
  const { projektLabel } = useStammdaten()
  const toast = useToast()

  const [laufende, setLaufende] = useState<LaufendeZeit[]>([])
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [jetzt, setJetzt] = useState(() => Date.now())
  const [statusEingabe, setStatusEingabe] = useState('')
  const [bearbeiteStatus, setBearbeiteStatus] = useState(false)

  const uid = session?.user.id ?? null

  const laden = useCallback(async () => {
    const [{ data: l }, { data: z }] = await Promise.all([
      supabase.from('laufende_zeiten').select('*'),
      supabase
        .from('arbeitszeiten')
        .select('*')
        .order('datum', { ascending: false })
        .limit(400),
    ])
    setLaufende((l as LaufendeZeit[]) ?? [])
    setZeiten((z as Arbeitszeit[]) ?? [])
  }, [])

  useEffect(() => {
    laden()
  }, [laden])

  // Sekundentakt für die laufenden Uhren.
  useEffect(() => {
    if (laufende.length === 0) return
    const id = window.setInterval(() => setJetzt(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [laufende.length])

  const wochenStartIso = useMemo(() => isoDatum(wochenStart(new Date())), [])

  /** Kennzahlen und letzter Eintrag je Person. */
  const proPerson = useMemo(() => {
    const map = new Map<
      string,
      { heute: number; woche: number; letzter: Arbeitszeit | null }
    >()
    for (const p of profiles) map.set(p.id, { heute: 0, woche: 0, letzter: null })
    for (const z of zeiten) {
      const eintrag = map.get(z.gesellschafter_id)
      if (!eintrag) continue
      if (z.datum === heuteIso()) eintrag.heute += z.dauer_minuten
      if (z.datum >= wochenStartIso) eintrag.woche += z.dauer_minuten
      // zeiten ist absteigend sortiert – der erste Treffer ist der jüngste.
      if (!eintrag.letzter) eintrag.letzter = z
    }
    return map
  }, [profiles, zeiten, wochenStartIso])

  const meinProfil = profiles.find((p) => p.id === uid) ?? null

  function statusBearbeitenStarten() {
    setStatusEingabe(meinProfil?.status_text ?? '')
    setBearbeiteStatus(true)
  }

  async function statusSpeichern(e: FormEvent) {
    e.preventDefault()
    if (!uid) return
    const text = statusEingabe.trim()
    const { error } = await supabase
      .from('profile')
      .update({
        status_text: text || null,
        status_gesetzt_am: text ? new Date().toISOString() : null,
      })
      .eq('id', uid)
    if (error) {
      toast('Status konnte nicht gespeichert werden.', 'fehler')
      return
    }
    await neuLaden()
    setBearbeiteStatus(false)
    toast(text ? 'Status gesetzt.' : 'Status entfernt.')
  }

  // Wer gerade arbeitet, steht oben.
  const sortiert = useMemo(() => {
    const laeuft = (id: string) => laufende.some((l) => l.gesellschafter_id === id)
    return [...profiles].sort((a, b) => {
      if (laeuft(a.id) !== laeuft(b.id)) return laeuft(a.id) ? -1 : 1
      if ((a.id === uid) !== (b.id === uid)) return a.id === uid ? -1 : 1
      return nameVon(a.id).localeCompare(nameVon(b.id))
    })
  }, [profiles, laufende, uid, nameVon])

  return (
    <div>
      <h1>Team</h1>
      <p className="muted">
        Wer arbeitet gerade woran – und was gibt es sonst zu wissen.
      </p>

      <div className="team-grid">
        {sortiert.map((p) => {
          const laeuft = laufende.find((l) => l.gesellschafter_id === p.id) ?? null
          const werte = proPerson.get(p.id)
          const eigen = p.id === uid
          const sekunden = laeuft
            ? Math.max(0, Math.floor((jetzt - new Date(laeuft.gestartet_am).getTime()) / 1000))
            : 0
          // Auch die Mitgesellschafter sollen sehen, wenn eine Uhr zu lange läuft.
          const laeuftLange = sekunden / 60 > WARNGRENZE_MINUTEN

          return (
            <div
              key={p.id}
              className={eigen ? 'team-karte eigen' : 'team-karte'}
              style={{ borderTopColor: farbeVon(p.id) }}
            >
              <div className="team-kopf">
                <span className="punkt" style={{ background: farbeVon(p.id) }} />
                <strong>{nameVon(p.id)}</strong>
                {eigen && <span className="team-du">du</span>}
              </div>

              {laeuft ? (
                <div className={laeuftLange ? 'team-aktiv warnung' : 'team-aktiv'}>
                  <div className="team-aktiv-kopf">
                    <span className="puls" style={{ background: farbeVon(p.id) }} />
                    <span className="team-uhr">{stoppuhrAnzeige(sekunden)}</span>
                  </div>
                  <div className="team-projekt">{projektLabel(laeuft.projekt_id)}</div>
                  {laeuft.beschreibung && (
                    <div className="muted small">{laeuft.beschreibung}</div>
                  )}
                  <div className="muted small">seit {uhrzeit(laeuft.gestartet_am)} Uhr</div>
                  {laeuftLange && (
                    <div className="team-warnung">Läuft ungewöhnlich lange</div>
                  )}
                </div>
              ) : (
                <div className="team-ruht muted small">Arbeitet gerade nicht</div>
              )}

              {/* Statusmeldung */}
              {eigen && bearbeiteStatus ? (
                <form className="team-status-form" onSubmit={statusSpeichern}>
                  <input
                    value={statusEingabe}
                    onChange={(e) => setStatusEingabe(e.target.value)}
                    placeholder="z. B. bis 14 Uhr beim Kunden"
                    maxLength={80}
                    autoFocus
                  />
                  <div className="team-status-knoepfe">
                    <button
                      type="button"
                      className="btn-ghost small"
                      onClick={() => setBearbeiteStatus(false)}
                    >
                      Abbrechen
                    </button>
                    <button className="btn-primary small" type="submit">
                      Speichern
                    </button>
                  </div>
                </form>
              ) : p.status_text ? (
                <div className="team-status">
                  <span>„{p.status_text}"</span>
                  <span className="muted small">
                    {relativerTag(p.status_gesetzt_am)}
                    {eigen && (
                      <button className="link-knopf" onClick={statusBearbeitenStarten}>
                        ändern
                      </button>
                    )}
                  </span>
                </div>
              ) : eigen ? (
                <button className="team-status-leer" onClick={statusBearbeitenStarten}>
                  + Status setzen
                </button>
              ) : null}

              <div className="team-zahlen">
                <div>
                  <span className="muted small">Heute</span>
                  <strong>{werte?.heute ? formatDauer(werte.heute) : '—'}</strong>
                </div>
                <div>
                  <span className="muted small">Diese Woche</span>
                  <strong>{werte?.woche ? formatDauer(werte.woche) : '—'}</strong>
                </div>
              </div>

              <div className="team-zuletzt muted small">
                {werte?.letzter ? (
                  <>
                    Zuletzt {relativerTag(werte.letzter.datum)}:{' '}
                    {projektLabel(werte.letzter.projekt_id)}
                    {werte.letzter.beschreibung ? ` – ${werte.letzter.beschreibung}` : ''}
                  </>
                ) : (
                  'Noch keine Zeiten erfasst'
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
