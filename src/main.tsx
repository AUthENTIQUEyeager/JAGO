import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EnvErrorScreen } from '@/components/EnvErrorScreen'
import { loadEnv } from '@/config/env'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable dans index.html')

const envResult = loadEnv()

createRoot(container).render(
  <StrictMode>{envResult.ok ? <App /> : <EnvErrorScreen errors={envResult.errors} />}</StrictMode>,
)
