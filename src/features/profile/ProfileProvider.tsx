import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../../lib/supabase'
import { STANDARD_FARBE, type Profile } from '../../lib/types'
import { useAuth } from '../auth/useAuth'

interface ProfileState {
  profiles: Profile[]
  meinProfil: Profile | null
  laden: boolean
  neuLaden: () => Promise<void>
  /** Anzeigename einer Person; fällt auf die E-Mail zurück, solange keiner gesetzt ist. */
  nameVon: (id: string | null) => string
  /** Farbe einer Person für Kalender und Auswertungen. */
  farbeVon: (id: string | null) => string
}

const ProfileContext = createContext<ProfileState>({
  profiles: [],
  meinProfil: null,
  laden: true,
  neuLaden: async () => {},
  nameVon: () => '—',
  farbeVon: () => STANDARD_FARBE,
})

export function useProfiles() {
  return useContext(ProfileContext)
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [laden, setLaden] = useState(true)

  const neuLaden = useCallback(async () => {
    const { data } = await supabase.from('profile').select('*').order('name')
    setProfiles((data as Profile[]) ?? [])
    setLaden(false)
  }, [])

  useEffect(() => {
    if (!session) {
      setProfiles([])
      setLaden(false)
      return
    }
    neuLaden()
  }, [session, neuLaden])

  const wert = useMemo<ProfileState>(() => {
    const meinProfil = session
      ? profiles.find((p) => p.id === session.user.id) ?? null
      : null

    const nameVon = (id: string | null) => {
      if (!id) return '—'
      const p = profiles.find((x) => x.id === id)
      if (!p) return 'Unbekannt'
      const name = (p.name ?? '').trim()
      return name || p.email || 'Ohne Namen'
    }

    const farbeVon = (id: string | null) => {
      if (!id) return '#9ca3af'
      return profiles.find((x) => x.id === id)?.farbe || STANDARD_FARBE
    }

    return { profiles, meinProfil, laden, neuLaden, nameVon, farbeVon }
  }, [profiles, session, laden, neuLaden])

  return <ProfileContext.Provider value={wert}>{children}</ProfileContext.Provider>
}
