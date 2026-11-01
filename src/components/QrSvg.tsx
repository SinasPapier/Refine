import { useMemo } from 'react'
import QRCode from 'qrcode'

/**
 * Zeichnet einen QR-Code als SVG.
 *
 * Bewusst selbst gezeichnet statt des fertigen SVG der Bibliothek: So steht
 * das Markup unter unserer Kontrolle (keine Fremdinhalte über innerHTML), und
 * Größe wie Ruhezone lassen sich genau setzen. Die Bibliothek liefert nur die
 * Modulmatrix.
 *
 * Fehlerkorrektur M und eine Ruhezone von vier Modulen sind in der
 * EPC-Spezifikation vorgegeben.
 */

/** Ruhezone in Modulen – ohne sie erkennen manche Lesegeräte den Code nicht. */
const RUHEZONE = 4

interface Matrix {
  size: number
  data: Uint8Array
}

/** Baut aus den dunklen Modulen einen einzigen SVG-Pfad. */
function pfadAus(matrix: Matrix, ruhezone: number): string {
  const teile: string[] = []
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[y * matrix.size + x]) {
        teile.push(`M${x + ruhezone} ${y + ruhezone}h1v1h-1z`)
      }
    }
  }
  return teile.join('')
}

export interface QrBild {
  /** Kantenlänge in Modulen, Ruhezone eingerechnet. */
  kante: number
  pfad: string
}

/** Erzeugt Pfad und Maß – ohne React, damit es auch zum Herunterladen taugt. */
export function qrBildErzeugen(text: string, ruhezone = RUHEZONE): QrBild {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const matrix = qr.modules as unknown as Matrix
  return {
    kante: matrix.size + ruhezone * 2,
    pfad: pfadAus(matrix, ruhezone),
  }
}

/**
 * Vollständiges SVG als Text – für den Download und zum Einfügen in Word.
 * Mit `ruhezone: 0` ist es der nackte Code; der Rand muss dann im Zieldokument
 * (z. B. weiße Fläche oder Abstand zum Text) selbst freigehalten werden.
 */
export function qrSvgText(
  text: string,
  { kantenlaengeMm = 30, ruhezone = RUHEZONE } = {},
): string {
  const { kante, pfad } = qrBildErzeugen(text, ruhezone)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${kantenlaengeMm}mm" height="${kantenlaengeMm}mm" viewBox="0 0 ${kante} ${kante}" shape-rendering="crispEdges">`,
    `<rect width="${kante}" height="${kante}" fill="#ffffff"/>`,
    `<path d="${pfad}" fill="#000000"/>`,
    '</svg>',
    '',
  ].join('\n')
}

/**
 * Der Code zum Ansehen. Schwarz auf weiß, ohne Logo und ohne Farbe – farbige
 * oder überdeckte Codes werden von Banking-Apps teils abgewiesen.
 */
export default function QrSvg({
  text,
  titel,
}: {
  text: string
  /** Für Vorlesefunktion und Mauszeiger. */
  titel: string
}) {
  const { kante, pfad } = useMemo(() => qrBildErzeugen(text), [text])

  return (
    <svg
      className="qr-svg"
      viewBox={`0 0 ${kante} ${kante}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={titel}
    >
      <rect width={kante} height={kante} fill="#ffffff" />
      <path d={pfad} fill="#000000" />
    </svg>
  )
}
