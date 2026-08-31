import { setLocale } from '../i18n'
import { useLocale } from '../hooks'

export function LangSwitch() {
  const locale = useLocale()
  return (
    <div id="langSwitch">
      <button type="button" className={locale === 'es' ? 'on' : ''} onClick={() => setLocale('es')}>
        Español
      </button>
      <button type="button" className={locale === 'en' ? 'on' : ''} onClick={() => setLocale('en')}>
        English
      </button>
    </div>
  )
}
