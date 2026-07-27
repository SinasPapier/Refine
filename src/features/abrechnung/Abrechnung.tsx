import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, Kunde } from '../../lib/types'
import { formatDatum, formatDauer, formatStundenDezimal } from '../../lib/format'
import { isoDatum, MONATE, monatePlus } from '../../lib/datum'
import { useToast } from '../../components/Toast'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

function euro(betrag: number): string {
  return betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function stunden(minuten: number): string {
  return formatStundenDezimal(minuten).replace('.', ',')
}

/** Eine Zeile der Aufschlüsselung: eine Tätigkeit innerhalb eines Kunden. */
interface SatzZeile {
  taetigkeit: string | null
  bezeichnung: string
  minuten: number
  satz: number | null
  betrag: number
}

export default function Abrechnung() {
  const { kunden, kundeVonProjekt, projektName, bezeichnungVon } = useStammdaten()
  const { nameVon } = useProfiles()
  const toast = useToast()

  const [anker, setAnker] = useState(() => {
    const h = new Date()
    return new Date(h.getFullYear(), h.getMonth(), 1)
  })
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [offen, setOffen] = useState<string | null>(null)

  const von = isoDatum(new Date(anker.getFullYear(), anker.getMonth(), 1))
  const bis = isoDatum(new Date(anker.getFullYear(), anker.getMonth() + 1, 0))

  const laden = useCallback(async () => {
    const { data } = await supabase
      .from('arbeitszeiten')
      .select('*')
      .gte('datum', von)
      .lte('datum', bis)
      .order('datum')
    setZeiten((data as Arbeitszeit[]) ?? [])
  }, [von, bis])

  useEffect(() => {
    laden()
  }, [laden])

  /**
   * Nach Kunde gruppieren und innerhalb nach Tätigkeit aufschlüsseln.
   * Der Betrag stammt aus dem Satz, der beim Buchen im Eintrag festgehalten
   * wurde – nicht aus dem heute gültigen Satz.
   */
  const gruppen = useMemo(() => {
    const nachKunde = new Map<string, Arbeitszeit[]>()
    for (const z of zeiten) {
      const key = kundeVonProjekt(z.projekt_id)?.id ?? 'ohne'
      const liste = nachKunde.get(key) ?? []
      liste.push(z)
      nachKunde.set(key, liste)
    }

    return [...nachKunde.entries()]
      .map(([kundeId, eintraege]) => {
        const kunde: Kunde | null =
          kundeId === 'ohne' ? null : kunden.find((k) => k.id === kundeId) ?? null

        const nachSatz = new Map<string, SatzZeile>()
        for (const z of eintraege) {
          const key = z.taetigkeit ?? '—'
          const zeile =
            nachSatz.get(key) ??
            ({
              taetigkeit: z.taetigkeit,
              bezeichnung: z.taetigkeit ? bezeichnungVon(z.taetigkeit) : 'nicht zugeordnet',
              minuten: 0,
              satz: z.stundensatz,
              betrag: 0,
            } satisfies SatzZeile)
          zeile.minuten += z.dauer_minuten
          // Innerhalb einer Tätigkeit können unterschiedliche Sätze stecken,
          // wenn der Satz zwischenzeitlich geändert wurde. Darum je Eintrag
          // rechnen statt am Ende pauschal.
          zeile.betrag += ((z.stundensatz ?? 0) * z.dauer_minuten) / 60
          if (zeile.satz !== z.stundensatz) zeile.satz = null
          nachSatz.set(key, zeile)
        }

        const zeilen = [...nachSatz.values()].sort((a, b) => b.minuten - a.minuten)
        const minuten = eintraege.reduce((s, z) => s + z.dauer_minuten, 0)
        const betrag = zeilen.reduce((s, z) => s + z.betrag, 0)
        const ohneTaetigkeit = zeilen.some((z) => z.taetigkeit === null)

        return { kundeId, kunde, eintraege, zeilen, minuten, betrag, ohneTaetigkeit }
      })
      .sort((a, b) => b.betrag - a.betrag || b.minuten - a.minuten)
  }, [zeiten, kunden, kundeVonProjekt, bezeichnungVon])

  const gesamtMinuten = zeiten.reduce((s, z) => s + z.dauer_minuten, 0)
  const gesamtBetrag = gruppen.reduce((s, g) => s + g.betrag, 0)

  /** Positionen als Text für die Rechnung in Word. */
  async function kopieren(gruppe: (typeof gruppen)[number]) {
    const zeilen: string[] = [
      `${gruppe.kunde?.name ?? 'Ohne Kunde'} – ${MONATE[anker.getMonth()]} ${anker.getFullYear()}`,
      '',
    ]

    for (const z of gruppe.zeilen) {
      // Je Tätigkeit die beteiligten Projekte nennen – so liest sich die
      // Rechnung nachvollziehbar.
      const projekte = [
        ...new Set(
          gruppe.eintraege
            .filter((e) => (e.taetigkeit ?? null) === z.taetigkeit)
            .map((e) => projektName(e.projekt_id)),
        ),
      ].join(', ')
      const satzText = z.satz != null ? `\t${euro(z.satz)}` : '\t'
      zeilen.push(`${z.bezeichnung} (${projekte})\t${stunden(z.minuten)} Std${satzText}\t${euro(z.betrag)}`)
    }

    zeilen.push('', `Gesamt\t${stunden(gruppe.minuten)} Std\t\t${euro(gruppe.betrag)}`)

    try {
      await navigator.clipboard.writeText(zeilen.join('\n'))
      toast('Positionen in die Zwischenablage kopiert.')
    } catch {
      toast('Kopieren nicht möglich.', 'fehler')
    }
  }

  return (
    <div>
      <h1>Abrechnung</h1>
      <p className="muted">
        Stunden je Kunde für einen Monat, aufgeschlüsselt nach Tätigkeit – als
        Vorlage für deine Rechnung.
      </p>

      <div className="kal-kopf">
        <div className="kal-navigation">
          <button className="btn-ghost small" onClick={() => setAnker((a) => monatePlus(a, -1))}>
            ◀
          </button>
          <span className="kal-titel">
            {MONATE[anker.getMonth()]} {anker.getFullYear()}
          </span>
          <button className="btn-ghost small" onClick={() => setAnker((a) => monatePlus(a, 1))}>
            ▶
          </button>
        </div>
        <div className="abrechnung-summe">
          Gesamt: <strong>{formatDauer(gesamtMinuten)}</strong>
          {gesamtBetrag > 0 && (
            <>
              {' '}
              · <strong>{euro(gesamtBetrag)}</strong>
            </>
          )}
        </div>
      </div>

      {gruppen.length === 0 ? (
        <p className="muted">In diesem Monat wurden keine Zeiten erfasst.</p>
      ) : (
        gruppen.map((g) => (
          <div className="card" key={g.kundeId}>
            <div className="abr-kopf">
              <div>
                <h2>
                  {g.kunde?.name ?? 'Ohne Kundenzuordnung'}
                  {g.kunde?.intern && <span className="tag-intern">intern</span>}
                </h2>
                <div className="muted small">
                  {g.kunde?.kundennummer ? `${g.kunde.kundennummer} · ` : ''}
                  {stunden(g.minuten)} Std
                </div>
              </div>
              <div className="abr-rechts">
                <div className="abr-betrag">
                  {g.betrag > 0 ? euro(g.betrag) : formatDauer(g.minuten)}
                </div>
                <div className="abr-knoepfe">
                  <button className="btn-ghost small" onClick={() => kopieren(g)}>
                    📋 Positionen kopieren
                  </button>
                  <button
                    className="btn-ghost small"
                    onClick={() => setOffen(offen === g.kundeId ? null : g.kundeId)}
                  >
                    {offen === g.kundeId ? 'Einzelposten ausblenden' : 'Einzelposten'}
                  </button>
                </div>
              </div>
            </div>

            {/* Aufschlüsselung nach Tätigkeit */}
            <div className="table-wrap">
              <table className="abr-saetze">
                <tbody>
                  {g.zeilen.map((z) => (
                    <tr key={z.taetigkeit ?? 'ohne'} className={z.taetigkeit ? '' : 'unzugeordnet'}>
                      <td>{z.bezeichnung}</td>
                      <td>{stunden(z.minuten)} Std</td>
                      <td>
                        {z.taetigkeit == null
                          ? '—'
                          : z.satz != null
                            ? `${euro(z.satz)}/Std`
                            : 'gemischte Sätze'}
                      </td>
                      <td className="rechts">
                        <strong>{euro(z.betrag)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {g.ohneTaetigkeit && (
              <p className="muted small">
                Einträge ohne Tätigkeit werden mit 0 € geführt. Du kannst sie unter
                „Arbeitszeiten" nachträglich zuordnen oder aufteilen.
              </p>
            )}

            {offen === g.kundeId && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Projekt</th>
                      <th>Tätigkeit</th>
                      <th>Beschreibung</th>
                      <th>Person</th>
                      <th>Dauer</th>
                      <th>Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.eintraege.map((z) => (
                      <tr key={z.id}>
                        <td>{formatDatum(z.datum)}</td>
                        <td>{projektName(z.projekt_id)}</td>
                        <td>{z.taetigkeit ? bezeichnungVon(z.taetigkeit) : '—'}</td>
                        <td>{z.beschreibung ?? '—'}</td>
                        <td>{nameVon(z.gesellschafter_id)}</td>
                        <td>{formatDauer(z.dauer_minuten)}</td>
                        <td>{euro(((z.stundensatz ?? 0) * z.dauer_minuten) / 60)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
