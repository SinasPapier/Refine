import type { Position } from '../lib/types'
import { formatZeitstempel } from '../lib/format'

/**
 * „· Florian" hinter dem Statuskennzeichen, in der Profilfarbe der Person.
 *
 * Nur bei „in Arbeit" und „erledigt": „offen" ist der Anlagezustand, dort wäre
 * die Angabe keine Information. Der genaue Zeitpunkt steht im Tooltip, damit
 * die Zeile schmal bleibt.
 */
export default function StatusUrheber({
  position,
  nameVon,
  farbeVon,
}: {
  position: Position
  nameVon: (id: string | null) => string
  farbeVon: (id: string | null) => string
}) {
  if (position.status === 'offen' || !position.status_von) return null

  const wann = position.status_am ? formatZeitstempel(position.status_am) : null
  const was = position.status === 'erledigt' ? 'erledigt' : 'in Arbeit gesetzt'

  return (
    <span
      className="status-urheber"
      style={{ color: farbeVon(position.status_von) }}
      title={wann ? `${was} von ${nameVon(position.status_von)} · ${wann}` : undefined}
    >
      {nameVon(position.status_von)}
    </span>
  )
}
