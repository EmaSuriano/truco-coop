import { useState } from 'react'
import { motion } from 'motion/react'
import type { Card as CardData } from '../deck'
import { cardLabel } from '../game'
import { publicUrl } from '../url'
import { WIDTH, HEIGHT } from '../config'

export type VizCard = {
  id: string
  x: number
  y: number
  kind: 'local' | 'back' | 'trick' | 'reveal' | 'won'
  card: CardData | null
  face: boolean
  illegal: boolean
  fromCenter: boolean
  fromRotate: number
  duration: number
  yaw: number
}

const TWEEN = { type: 'tween' as const, ease: 'easeOut' as const }

function FaceArt({
  card,
  face,
  className,
}: {
  card: CardData | null
  face: boolean
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const src =
    face && card ? publicUrl(`cards/${card.suit}-${card.rank}.png`) : publicUrl('cards/back.png')
  const red = card && (card.suit === 'oro' || card.suit === 'copa')
  return (
    <div className={className}>
      {!broken && (
        <img
          src={src}
          alt={face && card ? cardLabel(card) : ''}
          draggable={false}
          onError={() => setBroken(true)}
        />
      )}
      <div
        className={`card-fallback${!face ? ' is-back' : ''}${red ? ' red' : ''}`}
        style={{ display: broken ? 'flex' : 'none' }}
      >
        {face && card ? cardLabel(card) : ''}
      </div>
    </div>
  )
}

const LIFT = { y: -12, boxShadow: '0 14px 18px rgba(0,0,0,0.45)' }

export function CardView({
  viz,
  onPlay,
  focused,
}: {
  viz: VizCard
  onPlay?: (id: string) => void
  focused?: boolean
}) {
  const playable = viz.kind === 'local' && !viz.illegal
  const cls = ['card', viz.kind, viz.face ? '' : 'back', viz.illegal ? 'illegal' : '', focused ? 'kb-focus' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className={cls}
      initial={
        viz.fromCenter
          ? {
              left: WIDTH / 2,
              top: HEIGHT / 2,
              x: '-50%',
              y: '-50%',
              rotate: viz.fromRotate,
              opacity: 1,
            }
          : false
      }
      animate={{
        left: viz.x,
        top: viz.y,
        x: '-50%',
        y: '-50%',
        rotate: viz.yaw,
        opacity: 1,
      }}
      exit={{
        opacity: 0,
        transition: { ...TWEEN, duration: 0.2 },
      }}
      transition={{ ...TWEEN, duration: viz.duration }}
      onClick={() => {
        if (playable) onPlay?.(viz.id)
      }}
    >
      {viz.kind === 'reveal' ? (
        <motion.div
          className="card-inner"
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ ...TWEEN, duration: 0.4 }}
        >
          <FaceArt className="card-face" card={viz.card} face />
          <FaceArt className="card-face rear" card={null} face={false} />
        </motion.div>
      ) : (
        <motion.div
          className="card-inner"
          animate={focused ? LIFT : { y: 0, boxShadow: '0 0 0 rgba(0,0,0,0)' }}
          whileHover={playable ? LIFT : undefined}
          whileTap={playable ? { y: -2, scale: 0.98 } : undefined}
          transition={{ ...TWEEN, duration: 0.14 }}
        >
          <FaceArt card={viz.card} face={viz.face} />
        </motion.div>
      )}
    </motion.div>
  )
}
