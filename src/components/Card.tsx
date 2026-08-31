import { useState } from 'react'
import type { Card as CardData } from '../deck'
import { cardLabel } from '../game'
import { publicUrl } from '../url'

export type VizCard = {
  id: string
  x: number
  y: number
  kind: 'local' | 'back' | 'trick' | 'reveal'
  card: CardData | null
  face: boolean
  illegal: boolean
  flipMid: boolean
  noTrans: boolean
}

export function CardView({ viz, onPlay }: { viz: VizCard; onPlay?: (id: string) => void }) {
  const [broken, setBroken] = useState(false)
  const src =
    viz.face && viz.card
      ? publicUrl(`cards/${viz.card.suit}-${viz.card.rank}.png`)
      : publicUrl('cards/back.png')
  const cls = [
    'card',
    viz.kind,
    viz.face ? '' : 'back',
    viz.illegal ? 'illegal' : '',
    viz.flipMid ? 'flip-mid' : '',
    viz.noTrans ? 'no-trans' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const red = viz.card && (viz.card.suit === 'oro' || viz.card.suit === 'copa')
  return (
    <div
      className={cls}
      style={{ left: viz.x, top: viz.y }}
      onClick={() => {
        if (viz.kind === 'local' && !viz.illegal) onPlay?.(viz.id)
      }}
    >
      <div className="card-inner">
        {!broken && (
          <img
            src={src}
            alt={viz.face && viz.card ? cardLabel(viz.card) : ''}
            draggable={false}
            onError={() => setBroken(true)}
          />
        )}
        <div
          className={`card-fallback${!viz.face ? ' is-back' : ''}${red ? ' red' : ''}`}
          style={{ display: broken ? 'flex' : 'none' }}
        >
          {viz.face && viz.card ? cardLabel(viz.card) : ''}
        </div>
      </div>
    </div>
  )
}
