import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde, Projekt } from '../../lib/types'
import { formatDatum } from '../../lib/format'
import { heuteIso } from '../../lib/datum'
import { useToast } from '../../components/Toast'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

/** "seit 15.03.2026" bzw. "15.03.2026 – 27.07.2026" */
function zeitraum(von: string, bis: string | null): string {
  return bis ? `${formatDatum(von)} – ${formatDatum(bis)}` : `seit ${formatDatum(von)}`
}

export default function Kunden() {
  const toast = useToast()
  const { kunden, projekte, neuLaden } = useStammdaten()

  const [zeigeArchiv, setZeigeArchiv] = useState(false)
  const [bearbeiten, setBearbeiten] = useState<Kunde | null>(null)
  const [archivieren, setArchivieren] = useState<Kunde | null>(null)
  const [projekteVon, setProjekteVon] = useState<Kunde | null>(null)

  // Formular „neuer Kunde"
  const [name, setName] = useState('')
  const [ansprech, setAnsprech] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [intern, setIntern] = useState(false)
  const [mitNummer, setMitNummer] = useState(true)
  const [nummerManuell, setNummerManuell] = useState('')

  const sichtbar = kunden.filter((k) => k.archiviert === zeigeArchiv)

  async function neuerKunde(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    // Bestehende Kunden bringen ihre Nummer mit; neue bekommen eine erzeugt.
    let kundennummer: string | null = nummerManuell.trim() || null
    if (mitNummer) {
      const { data, error } = await supabase.rpc('next_nummer', {
        p_typ: 'kunde',
        p_notiz: name.trim(),
      })
      if (!error && data) kundennummer = data as string
    }

    const { error } = await supabase.from('kunden').insert({
      name: name.trim(),
      ansprechpartner: ansprech.trim() || null,
      email: email.trim() || null,
      telefon: telefon.trim() || null,
      intern,
      kundennummer,
    })
    if (error) {
      toast('Kunde konnte nicht angelegt werden.', 'fehler')
      return
    }
    toast(kundennummer ? `Kunde angelegt (${kundennummer})` : 'Kunde angelegt')
    setName('')
    setAnsprech('')
    setEmail('')
    setTelefon('')
    setNummerManuell('')
    setIntern(false)
    neuLaden()
  }

  async function reaktivieren(k: Kunde) {
    // Der Leistungszeitraum ist wieder offen, also Erledigungsdatum entfernen.
    const { error } = await supabase
      .from('kunden')
      .update({ archiviert: false, erledigt_am: null })
      .eq('id', k.id)
    if (error) {
      toast('Änderung fehlgeschlagen.', 'fehler')
      return
    }
    toast('Kunde wieder aktiv.')
    neuLaden()
  }

  return (
    <div>
      <h1>Kunden &amp; Projekte</h1>

      {!zeigeArchiv && (
        <div className="card">
          <h2>Neuer Kunde</h2>
          <form className="form-grid" onSubmit={neuerKunde}>
            <label>
              Name*
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Ansprechpartner
              <input value={ansprech} onChange={(e) => setAnsprech(e.target.value)} />
            </label>
            <label>
              E-Mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Telefon
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={intern}
                onChange={(e) => setIntern(e.target.checked)}
              />
              Interner Kunde (Tätigkeit wird auf „Internes" vorbelegt)
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={mitNummer}
                onChange={(e) => setMitNummer(e.target.checked)}
              />
              Kundennummer automatisch vergeben
            </label>
            {!mitNummer && (
              <label>
                Kundennummer (bestehende eintragen)
                <input
                  value={nummerManuell}
                  onChange={(e) => setNummerManuell(e.target.value)}
                  placeholder="z. B. K-00007"
                />
              </label>
            )}
            <div className="form-actions">
              <button className="btn-primary" type="submit">
                Kunde anlegen
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="segmented">
        <button className={!zeigeArchiv ? 'seg active' : 'seg'} onClick={() => setZeigeArchiv(false)}>
          Aktive ({kunden.filter((k) => !k.archiviert).length})
        </button>
        <button className={zeigeArchiv ? 'seg active' : 'seg'} onClick={() => setZeigeArchiv(true)}>
          Archiv ({kunden.filter((k) => k.archiviert).length})
        </button>
      </div>

      {sichtbar.length === 0 ? (
        <p className="muted">
          {zeigeArchiv ? 'Das Archiv ist leer.' : 'Noch keine Kunden angelegt.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kundennr.</th>
                <th>Name</th>
                <th>Kontakt</th>
                <th>Zeitraum</th>
                <th>Projekte</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((k) => {
                const anzahl = projekte.filter((p) => p.kunde_id === k.id).length
                return (
                  <tr key={k.id}>
                    <td className="nowrap">
                      <code>{k.kundennummer ?? '—'}</code>
                    </td>
                    <td>
                      <div>
                        {k.name}
                        {k.intern && <span className="tag-intern">intern</span>}
                      </div>
                      {k.ansprechpartner && (
                        <div className="muted small">{k.ansprechpartner}</div>
                      )}
                    </td>
                    <td className="spalte-kontakt">
                      {k.email && <div className="kontakt-zeile">{k.email}</div>}
                      {k.telefon && <div className="kontakt-zeile nowrap">{k.telefon}</div>}
                      {!k.email && !k.telefon && '—'}
                    </td>
                    <td className="nowrap">{zeitraum(k.angelegt_am, k.erledigt_am)}</td>
                    <td className="nowrap">
                      <button
                        className="btn-ghost small"
                        onClick={() => setProjekteVon(k)}
                        title="Projekte dieses Kunden verwalten"
                      >
                        {anzahl === 0
                          ? '+ Projekt anlegen'
                          : `${anzahl} ${anzahl === 1 ? 'Projekt' : 'Projekte'}`}
                      </button>
                    </td>
                    <td className="spalte-aktionen">
                      <div className="aktionen">
                        <button className="btn-ghost small" onClick={() => setBearbeiten(k)}>
                          Bearbeiten
                        </button>
                        {k.archiviert ? (
                          <button className="btn-ghost small" onClick={() => reaktivieren(k)}>
                            Reaktivieren
                          </button>
                        ) : (
                          <button className="btn-ghost small" onClick={() => setArchivieren(k)}>
                            Archivieren
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

      {projekteVon && (
        <ProjekteDialog
          kunde={projekteVon}
          onSchliessen={() => setProjekteVon(null)}
          onGeaendert={neuLaden}
        />
      )}

      {bearbeiten && (
        <KundeDialog
          kunde={bearbeiten}
          onSchliessen={() => setBearbeiten(null)}
          onGespeichert={neuLaden}
        />
      )}

      {archivieren && (
        <ArchivDialog
          kunde={archivieren}
          onSchliessen={() => setArchivieren(null)}
          onGespeichert={neuLaden}
        />
      )}
    </div>
  )
}

/** Fragt beim Archivieren nach dem Ende des Leistungszeitraums. */
function ArchivDialog({
  kunde,
  onSchliessen,
  onGespeichert,
}: {
  kunde: Kunde
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const toast = useToast()
  const [datum, setDatum] = useState(heuteIso())
  const [speichert, setSpeichert] = useState(false)

  async function archivieren() {
    setSpeichert(true)
    const { error } = await supabase
      .from('kunden')
      .update({ archiviert: true, erledigt_am: datum })
      .eq('id', kunde.id)
    setSpeichert(false)
    if (error) {
      toast('Archivieren fehlgeschlagen.', 'fehler')
      return
    }
    toast('Kunde archiviert.')
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>„{kunde.name}" archivieren</h2>
        <p className="muted small">
          Der Kunde verschwindet aus den Auswahllisten, gebuchte Zeiten bleiben
          erhalten. Wann wurde die Zusammenarbeit abgeschlossen?
        </p>

        <label>
          Erledigungsdatum
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>

        <div className="muted small">
          Leistungszeitraum: {formatDatum(kunde.angelegt_am)} – {formatDatum(datum)}
        </div>

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={archivieren} disabled={speichert}>
              {speichert ? 'Archiviert…' : 'Archivieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function KundeDialog({
  kunde,
  onSchliessen,
  onGespeichert,
}: {
  kunde: Kunde
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const toast = useToast()
  const { meinProfil } = useProfiles()
  const istAdmin = meinProfil?.ist_admin ?? false

  const [name, setName] = useState(kunde.name)
  const [ansprech, setAnsprech] = useState(kunde.ansprechpartner ?? '')
  const [email, setEmail] = useState(kunde.email ?? '')
  const [telefon, setTelefon] = useState(kunde.telefon ?? '')
  const [nummer, setNummer] = useState(kunde.kundennummer ?? '')
  const [intern, setIntern] = useState(kunde.intern)
  const [angelegt, setAngelegt] = useState(kunde.angelegt_am)

  const veraendert =
    name.trim() !== kunde.name ||
    ansprech.trim() !== (kunde.ansprechpartner ?? '') ||
    email.trim() !== (kunde.email ?? '') ||
    telefon.trim() !== (kunde.telefon ?? '') ||
    nummer.trim() !== (kunde.kundennummer ?? '') ||
    intern !== kunde.intern ||
    (istAdmin && angelegt !== kunde.angelegt_am)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase
      .from('kunden')
      .update({
        name: name.trim(),
        ansprechpartner: ansprech.trim() || null,
        email: email.trim() || null,
        telefon: telefon.trim() || null,
        kundennummer: nummer.trim() || null,
        intern,
        // Nur Administratoren dürfen das Anlagedatum verschieben; die
        // Datenbank weist es andernfalls ohnehin ab.
        ...(istAdmin ? { angelegt_am: angelegt } : {}),
      })
      .eq('id', kunde.id)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast('Kunde geändert.')
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={speichern}>
        <h2>Kunde bearbeiten</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Ansprechpartner
          <input value={ansprech} onChange={(e) => setAnsprech(e.target.value)} />
        </label>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Telefon
          <input value={telefon} onChange={(e) => setTelefon(e.target.value)} />
        </label>
        <label>
          Kundennummer
          <input
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
            placeholder="z. B. K-00007"
          />
        </label>
        <label>
          Angelegt am {!istAdmin && <span className="muted small">(nur Administrator)</span>}
          <input
            type="date"
            value={angelegt}
            onChange={(e) => setAngelegt(e.target.value)}
            disabled={!istAdmin}
          />
        </label>
        {kunde.erledigt_am && (
          <div className="muted small">
            Erledigt am {formatDatum(kunde.erledigt_am)} – beim Reaktivieren wird das
            Datum entfernt.
          </div>
        )}
        <label className="checkbox-inline">
          <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />
          Interner Kunde
        </label>
        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button type="button" className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button
              className="btn-primary"
              type="submit"
              disabled={!veraendert}
              title={!veraendert ? 'Es wurde nichts geändert' : undefined}
            >
              Speichern
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

/**
 * Projekte eines Kunden. Bewusst als Dialog: Vorher klappte die Liste unter
 * der Tabelle auf und lag dadurch außerhalb des sichtbaren Bereichs – es sah
 * aus, als würde der Klick nichts bewirken.
 */
function ProjekteDialog({
  kunde,
  onSchliessen,
  onGeaendert,
}: {
  kunde: Kunde
  onSchliessen: () => void
  onGeaendert: () => void
}) {
  const toast = useToast()
  const { projekte } = useStammdaten()
  const [name, setName] = useState('')
  const [erledigt, setErledigt] = useState<Projekt | null>(null)

  const eigene = projekte.filter((p) => p.kunde_id === kunde.id)

  async function neu(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase
      .from('projekte')
      .insert({ kunde_id: kunde.id, name: name.trim() })
    if (error) {
      toast('Projekt konnte nicht angelegt werden.', 'fehler')
      return
    }
    toast(`Projekt „${name.trim()}" angelegt.`)
    setName('')
    onGeaendert()
  }

  async function reaktivieren(p: Projekt) {
    await supabase
      .from('projekte')
      .update({ archiviert: false, erledigt_am: null })
      .eq('id', p.id)
    onGeaendert()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal breit" onClick={(e) => e.stopPropagation()}>
        <h2>Projekte von „{kunde.name}"</h2>
        <p className="muted small">
          Wofür wurdet ihr beauftragt? Zum Beispiel „Visitenkartengestaltung"
          oder „Flyergestaltung". Diese Projekte stehen dann in der Stoppuhr zur
          Auswahl.
        </p>

        <form className="inline-form" onSubmit={neu}>
          <input
            placeholder="Neues Projekt…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={!name.trim()}>
            Anlegen
          </button>
        </form>

        {eigene.length === 0 ? (
          <p className="muted">Noch keine Projekte für diesen Kunden.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Angelegt / erledigt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {eigene.map((p) => (
                  <tr key={p.id}>
                    <td className={p.archiviert ? 'muted' : ''}>
                      {p.name}
                      {p.archiviert && <span className="tag-intern">erledigt</span>}
                    </td>
                    <td className="nowrap">{zeitraum(p.angelegt_am, p.erledigt_am)}</td>
                    <td className="spalte-aktionen">
                      <div className="aktionen">
                        {p.archiviert ? (
                          <button className="btn-ghost small" onClick={() => reaktivieren(p)}>
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
                ))}
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

        {erledigt && (
          <ProjektArchivDialog
            projekt={erledigt}
            onSchliessen={() => setErledigt(null)}
            onGespeichert={onGeaendert}
          />
        )}
      </div>
    </div>
  )
}

function ProjektArchivDialog({
  projekt,
  onSchliessen,
  onGespeichert,
}: {
  projekt: Projekt
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const toast = useToast()
  const [datum, setDatum] = useState(heuteIso())

  async function archivieren() {
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
            <button className="btn-primary" onClick={archivieren}>
              Als erledigt markieren
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
