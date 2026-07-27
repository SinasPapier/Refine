import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

export default function Kunden() {
  const toast = useToast()
  const { kunden, projekte, neuLaden } = useStammdaten()

  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null)
  const [zeigeArchiv, setZeigeArchiv] = useState(false)
  const [bearbeiten, setBearbeiten] = useState<Kunde | null>(null)

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

  async function archivieren(k: Kunde, archiv: boolean) {
    const { error } = await supabase
      .from('kunden')
      .update({ archiviert: archiv })
      .eq('id', k.id)
    if (error) {
      toast('Änderung fehlgeschlagen.', 'fehler')
      return
    }
    toast(archiv ? 'Kunde archiviert.' : 'Kunde wieder aktiv.')
    if (ausgewaehlt === k.id) setAusgewaehlt(null)
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
                  placeholder="z. B. K-0007"
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
                <th>Ansprechpartner</th>
                <th>Kontakt</th>
                <th>Art</th>
                <th>Projekte</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((k) => (
                <tr key={k.id}>
                  <td>
                    <code>{k.kundennummer ?? '—'}</code>
                  </td>
                  <td>{k.name}</td>
                  <td>{k.ansprechpartner ?? '—'}</td>
                  <td>
                    {k.email ?? ''}
                    {k.email && k.telefon ? ' · ' : ''}
                    {k.telefon ?? ''}
                    {!k.email && !k.telefon ? '—' : ''}
                  </td>
                  <td>{k.intern ? 'intern' : 'Kunde'}</td>
                  <td>
                    <button
                      className="btn-ghost small"
                      onClick={() => setAusgewaehlt(ausgewaehlt === k.id ? null : k.id)}
                    >
                      {projekte.filter((p) => p.kunde_id === k.id).length} Projekt(e)
                    </button>
                  </td>
                  <td className="aktionen">
                    <button className="btn-ghost small" onClick={() => setBearbeiten(k)}>
                      Bearbeiten
                    </button>
                    <button
                      className="btn-ghost small"
                      onClick={() => archivieren(k, !k.archiviert)}
                    >
                      {k.archiviert ? 'Reaktivieren' : 'Archivieren'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ausgewaehlt && (
        <Projekte
          kunde={kunden.find((k) => k.id === ausgewaehlt)!}
          onChange={neuLaden}
        />
      )}

      {bearbeiten && (
        <KundeDialog
          kunde={bearbeiten}
          onSchliessen={() => setBearbeiten(null)}
          onGespeichert={neuLaden}
        />
      )}
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
  const [name, setName] = useState(kunde.name)
  const [ansprech, setAnsprech] = useState(kunde.ansprechpartner ?? '')
  const [email, setEmail] = useState(kunde.email ?? '')
  const [telefon, setTelefon] = useState(kunde.telefon ?? '')
  const [nummer, setNummer] = useState(kunde.kundennummer ?? '')
  const [intern, setIntern] = useState(kunde.intern)

  // Speichern erst zulassen, wenn sich etwas vom Ausgangszustand unterscheidet.
  const veraendert =
    name.trim() !== kunde.name ||
    ansprech.trim() !== (kunde.ansprechpartner ?? '') ||
    email.trim() !== (kunde.email ?? '') ||
    telefon.trim() !== (kunde.telefon ?? '') ||
    nummer.trim() !== (kunde.kundennummer ?? '') ||
    intern !== kunde.intern

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
            placeholder="z. B. K-0007"
          />
        </label>
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

function Projekte({ kunde, onChange }: { kunde: Kunde; onChange: () => void }) {
  const toast = useToast()
  const { projekte } = useStammdaten()
  const [name, setName] = useState('')

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
    setName('')
    onChange()
  }

  async function archivieren(id: string, archiv: boolean) {
    await supabase.from('projekte').update({ archiviert: archiv }).eq('id', id)
    onChange()
  }

  return (
    <div className="card">
      <h2>Projekte von „{kunde.name}"</h2>
      <form className="inline-form" onSubmit={neu}>
        <input
          placeholder="Neues Projekt…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary" type="submit">
          Hinzufügen
        </button>
      </form>
      {eigene.length === 0 ? (
        <p className="muted">Noch keine Projekte.</p>
      ) : (
        <ul className="liste">
          {eigene.map((p) => (
            <li key={p.id}>
              <span className={p.archiviert ? 'muted' : ''}>
                {p.name}
                {p.archiviert && ' (archiviert)'}
              </span>
              <button
                className="btn-ghost small"
                onClick={() => archivieren(p.id, !p.archiviert)}
              >
                {p.archiviert ? 'Reaktivieren' : 'Archivieren'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Archivieren statt löschen: Bereits gebuchte Zeiten behalten so ihre
        Zuordnung und bleiben in der Abrechnung nachvollziehbar.
      </p>
    </div>
  )
}
