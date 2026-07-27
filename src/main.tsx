import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './features/auth/useAuth'
import { ProfileProvider } from './features/profile/ProfileProvider'
import { StammdatenProvider } from './features/stammdaten/StammdatenProvider'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <ProfileProvider>
          <StammdatenProvider>
            <App />
          </StammdatenProvider>
        </ProfileProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
)
