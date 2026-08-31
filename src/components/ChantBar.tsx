import { motion } from 'motion/react'
import type { ActName, ActMsg, ViewState } from '../game'
import { actorSeat } from '../game'
import { t } from '../i18n'
import { useLocale } from '../hooks'
import { publicUrl } from '../url'

const BUTTONS: { name: ActName; label: string }[] = [
  { name: 'envido', label: 'Envido' },
  { name: 'real', label: 'Real Envido' },
  { name: 'falta', label: 'Falta' },
  { name: 'truco', label: 'Truco' },
  { name: 'retruco', label: 'Retruco' },
  { name: 'vale', label: 'Vale cuatro' },
  { name: 'quiero', label: 'Quiero' },
  { name: 'no', label: 'No quiero' },
]

const PRESS = { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.1 }

function localLegal(view: ViewState): string[] {
  if (view.mySeat < 0) return []
  if (view.lastPub && view.lastPub.legal[view.mySeat]) return view.lastPub.legal[view.mySeat]!
  return []
}

export function ChantBar({ view, dispatch }: { view: ViewState; dispatch: (act: ActMsg) => void }) {
  useLocale()
  const legal = localLegal(view)
  const actor = actorSeat(view.lastPub)
  let hint = ''
  if (legal.includes('quiero') || legal.includes('no')) hint = t('answerChant')
  else if (legal.includes('play')) hint = t('clickCard')
  else if (legal.length > 0) hint = t('yourChants')
  else if (actor !== null && view.lastPub?.disconnected?.[actor]) hint = t('waitingReconnect', { n: actor })
  else if (actor !== null && actor !== view.mySeat) hint = t('waitingOn', { n: actor })

  function click(name: ActName) {
    if (!legal.includes(name)) return
    if (name === 'quiero') dispatch({ t: 'quiero' })
    else if (name === 'no') dispatch({ t: 'no' })
    else if (name !== 'play') dispatch({ t: 'chant', name })
  }

  return (
    <div id="chantBar">
      <img className="chantFlourish" alt="" aria-hidden="true" src={publicUrl('ui/button-ornament.png')} />
      {BUTTONS.map((b) => {
        const enabled = legal.includes(b.name)
        return (
          <motion.button
            key={b.name}
            type="button"
            className="chantBtn"
            disabled={!enabled}
            onClick={() => click(b.name)}
            whileHover={enabled ? { y: -1 } : undefined}
            whileTap={enabled ? { scale: 0.97 } : undefined}
            transition={PRESS}
          >
            {b.label}
          </motion.button>
        )
      })}
      <div id="actionHint">{hint}</div>
    </div>
  )
}
