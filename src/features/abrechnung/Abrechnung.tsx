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

export default function Abrechnung() {
  const { kunden, kundeVonProjekt, projektName } = useStammdaten()
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

  /** Einträge nach Kunde gruppieren; "ohne" sammelt alles ohne Kundenbezug. */
  const gruppen = useMemo(() => {
    const map = new Map<string, Arbeitszeit[]>()
    for (const z of zeiten) {
      const kunde = kundeVonProjekt(z.projekt_id)
      const key = kunde?.id ?? 'ohne'
      const liste = map.get(key) ?? []
      liste.push(z)
      map.set(key, liste)
    }
    return [...map.entries()]
      .map(([kundeId, eintraege]) => {
        const kunde: Kunde | null =
          kundeId === 'ohne' ? null : kunden.find((k) => k.id === kundeId) ?? null
        const minuten = eintraege.reduce((s, z) => s + z.dauer_minuten, 0)
        const satz = kunde?.stundensatz ?? null
        return {
          kundeId,
          kunde,
          eintraege,
          minuten,
          satz,
          betrag: satz != null ? (minuten / 60) * satz : null,
        }
      })
      .sort((a, b) => b.minuten - a.minuten)
  }, [zeiten, kunden, kundeVonProjekt])

  const gesamtMinuten = zeiten.reduce((s, z) => s + z.dauer_minuten, 0)
  const gesamtBetrag = gruppen.reduce((s, g) => s + (g.betrag ?? 0), 0)

  /** Positionen als Text für die Rechnung in Word. */
  async function kopieren(gruppe: (typeof gruppen)[number]) {
    const kopf = `${gruppe.kunde?.name ?? 'Ohne Kunde'} – ${
      MONATE[anker.getMonth()]
    } ${anker.getFullYear()}`

    // Nach Projekt zusammenfassen, das ist die übliche Rechnungsstruktur.
    const proProjekt = new Map<string, number>()
    for (const z of gruppe.eintraege) {
      const name = projektName(z.projekt_id)
      proProjekt.set(name, (proProjekt.get(name) ?? 0) + z.dauer_minuten)
    }

    const zeilen = [...proProjekt.entries()].map(([name, min]) => {
      const stunden = formatStundenDezimal(min).replace('.', ',')
      if (gruppe.satz != null) {
        return `${name}\t${stunden} Std\t${euro(gruppe.satz)}\t${euro((min / 60) * gruppe.satz)}`
      }
      return `${name}\t${stunden} Std`
    })

    const summe =
      gruppe.betrag != null
        ? `Gesamt\t${formatStundenDezimal(gruppe.minuten).replace('.', ',')} Std\t\t${euro(gruppe.betrag)}`
        : `Gesamt\t${formatStundenDezimal(gruppe.minuten).replace('.', ',')} Std`

    const text = [kopf, '', ...zeilen, '', summe].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast('Positionen in die Zwischenablage kopiert.')
    } catch {
      toast('Kopieren nicht möglich.', 'fehler')
    }
  }

  return (
    <div>
      <h1>Abrechnung</h1>
      <p className="muted">
        Stunden je Kunde für einen Monat – als Vorlage für deine Rechnung.
        Ein Betrag erscheint, sobald beim Kunden ein Stundensatz hinterlegt ist.
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
          {gesamtBetrag > 0 && <> · <strong>{euro(gesamtBetrag)}</strong></>}
        </div>
      </div>

      {gruppen.length === 0 ? (
        <p className="muted">In diesem Monat wurden keine Zeiten erfasst.</p>
      ) : (
        gruppen.map((g) => (
          <div className="card" key={g.kundeId}>
            <div className="abr-kopf">
              <div>
                <h2>{g.kunde?.name ?? 'Ohne Kundenzuordnung'}</h2>
                <div className="muted small">
                  {g.kunde?.kundennummer ? `${g.kunde.kundennummer} · ` : ''}
                  {formatStundenDezimal(g.minuten).replace('.', ',')} Std
                  {g.satz != null && ` · ${euro(g.satz)}/Std`}
                </div>
              </div>
              <div className="abr-rechts">
                <div className="abr-betrag">
                  {g.betrag != null ? euro(g.betrag) : formatDauer(g.minuten)}
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

            {g.satz == null && g.kunde && (
              <p className="muted small">
                Kein Stundensatz hinterlegt – unter „Kunden &amp; Projekte" kannst du
                einen eintragen, dann wird hier auch der Betrag berechnet.
              </p>
            )}

            {offen === g.kundeId && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Projekt</th>
                      <th>Beschreibung</th>
                      <th>Person</th>
                      <th>Dauer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.eintraege.map((z) => (
                      <tr key={z.id}>
                        <td>{formatDatum(z.datum)}</td>
                        <td>{projektName(z.projekt_id)}</td>
                        <td>{z.beschreibung ?? '—'}</td>
                        <td>{nameVon(z.gesellschafter_id)}</td>
                        <td>{formatDauer(z.dauer_minuten)}</td>
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
