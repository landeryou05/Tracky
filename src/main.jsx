// Import React Packages.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import './index.css'
import App from './App.jsx'

const oidcConfig = {
  authority: 'https://auth.matthewlanderyou.dedyn.io/application/o/tracky/',
  client_id: 'qHmAt1U6kbbOzN0LtQU0UHbmLUxQk1UqFE7WPMsJ',
  redirect_uri: window.location.origin + '/',
  post_logout_redirect_uri: window.location.origin + '/',
  scope: 'openid profile email',
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname)
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <App />
    </AuthProvider>
  </StrictMode>
)