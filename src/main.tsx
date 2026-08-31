import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initI18n } from './i18n'

initI18n()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')
createRoot(root).render(<App />)
