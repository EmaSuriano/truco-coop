import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, useAnimate } from 'motion/react'
import { WIDTH, HEIGHT, teamOf } from '../config'
import type { Card as CardData } from '../deck'
import { cardId, sameCard } from '../deck'
import { chantLabel } from '../game'
import type { ViewState } from '../game'
import { t } from '../i18n'
import { useLocale } from '../hooks'
import { visOf, seatAnchor } from '../layout'
import { publicUrl } from '../url'
import { CardView, type VizCard } from './Card'

type Engine = {
  hand: VizCard[]
  opp: VizCard[][]
  trick: VizCard[]
  won: VizCard[]
  reveal: VizCard[]
  prevTrickLen: number
  prevWinsLen: number
  lastDealN: number
  lastChantN: number
  revealing: boolean
  dealing: boolean
  dealGen: number
  nid: number
}

function localRest(i: number, n: number) {
  const gap = 12
  const w = 72
  const h = 100
  const total = n * w + Math.max(0, n - 1) * gap
  const x0 = WIDTH / 2 - total / 2
  return { x: x0 + i * (w + gap) + w / 2, y: HEIGHT - 148 + h / 2 }
}

function oppRest(seat: number, i: number, n: number, mySeat: number, seats: number) {
  const vis = visOf(seat, mySeat, seats)
  const a = seatAnchor(vis)
  const gap = 6
  const w = 36
  const h = 50
  if (vis === 1 || vis === 3) {
    const total = n * h + Math.max(0, n - 1) * gap
    const y0 = a.y - total / 2
    return { x: a.x, y: y0 + i * (h + gap) + h / 2 }
  }
  const total = n * w + Math.max(0, n - 1) * gap
  const x0 = a.x - total / 2
  return { x: x0 + i * (w + gap) + w / 2, y: a.y }
}

function trickPos(seat: number, mySeat: number, seats: number) {
  const vis = visOf(seat, mySeat, seats)
  const cx = WIDTH / 2 + (vis === 1 ? -70 : vis === 3 ? 70 : 0)
  const cy = HEIGHT / 2 + (vis === 2 ? -52 : vis === 0 ? 52 : 0) - 10
  return { x: cx, y: cy }
}

function seatForWon(mark: number | 'parda', turn: number, seats: number): number | null {
  if (mark === 'parda') return null
  if (teamOf(turn, seats) === mark) return turn
  for (let s = 0; s < seats; s++) {
    if (teamOf(s, seats) === mark) return s
  }
  return turn
}

function wonPos(
  mark: number | 'parda',
  pileIndex: number,
  cardIndex: number,
  mySeat: number,
  seats: number,
  turn: number,
) {
  const fanX = cardIndex * 8
  const fanY = cardIndex * 4
  const yaw = (cardIndex - 1) * 6
  if (mark === 'parda') {
    return {
      x: WIDTH / 2 + fanX + pileIndex * 18,
      y: HEIGHT / 2 + 8 + fanY,
      yaw,
    }
  }
  const seat = seatForWon(mark, turn, seats) ?? turn
  const vis = visOf(seat, mySeat, seats)
  const a = seatAnchor(vis)
  const pile = pileIndex * 22
  if (vis === 0) return { x: a.x + 188 + fanX + pile, y: a.y - 86 + fanY, yaw }
  if (vis === 2) return { x: a.x + 188 + fanX + pile, y: a.y + 78 + fanY, yaw }
  if (vis === 1) return { x: a.x + 78 + fanX, y: a.y + 92 + fanY + pile, yaw }
  return { x: a.x - 78 + fanX, y: a.y + 92 + fanY + pile, yaw }
}

function localLegal(view: ViewState): string[] {
  if (view.mySeat < 0) return []
  if (view.lastPub && view.lastPub.legal[view.mySeat]) return view.lastPub.legal[view.mySeat]!
  return []
}

export function Felt({ view, onPlay }: { view: ViewState; onPlay: (i: number) => void }) {
  useLocale()
  const [cards, setCards] = useState<VizCard[]>([])
  const [feltScope, animateFelt] = useAnimate()
  const animateFeltRef = useRef(animateFelt)
  animateFeltRef.current = animateFelt
  const engine = useRef<Engine>({
    hand: [],
    opp: [[], [], [], []],
    trick: [],
    won: [],
    reveal: [],
    prevTrickLen: 0,
    prevWinsLen: 0,
    lastDealN: -1,
    lastChantN: -1,
    revealing: false,
    dealing: false,
    dealGen: 0,
    nid: 0,
  })
  const onPlayRef = useRef(onPlay)
  onPlayRef.current = onPlay
  const viewRef = useRef(view)
  viewRef.current = view

  function flush() {
    const e = engine.current
    setCards([...e.won, ...e.hand, ...e.opp.flat(), ...e.trick, ...e.reveal])
  }

  function makeCard(
    x: number,
    y: number,
    kind: VizCard['kind'],
    card: CardData | null,
    face: boolean,
    extra?: Partial<Pick<VizCard, 'fromCenter' | 'fromRotate' | 'duration' | 'yaw'>>,
  ): VizCard {
    const e = engine.current
    e.nid += 1
    const id = card ? `d${e.dealGen}:${cardId(card)}` : `d${e.dealGen}:n${e.nid}`
    return {
      id,
      x,
      y,
      kind,
      card,
      face,
      illegal: false,
      fromCenter: extra?.fromCenter ?? false,
      fromRotate: extra?.fromRotate ?? 0,
      duration: extra?.duration ?? 0.4,
      yaw: extra?.yaw ?? 0,
    }
  }

  function clearGroup(list: VizCard[]) {
    list.length = 0
  }

  useEffect(() => {
    if (!view.lastPub) return
    const pub = view.lastPub
    const e = engine.current
    const seats = pub.seatCount === 4 ? 4 : 2
    const me = view.mySeat

    function dimLocal() {
      const can = localLegal(viewRef.current).includes('play')
      for (const o of e.hand) o.illegal = !can
      flush()
    }

    function restackHand(moveDuration = 0.32) {
      const n = e.hand.length
      e.hand.forEach((o, i) => {
        const rest = localRest(i, n)
        if (o.x === rest.x && o.y === rest.y) return
        o.x = rest.x
        o.y = rest.y
        o.duration = moveDuration
      })
    }

    function liveHand(): CardData[] {
      return viewRef.current.myHand
    }

    function tableHas(card: CardData): boolean {
      if (pub.trick.some((p) => sameCard(p.card, card))) return true
      if (e.trick.some((o) => o.card && sameCard(o.card, card))) return true
      if (e.won.some((o) => o.card && sameCard(o.card, card))) return true
      return false
    }

    function handHasId(id: string): boolean {
      return e.hand.some((o) => o.card && cardId(o.card) === id)
    }

    function placeInTrick(obj: VizCard, seat: number, card: CardData | null) {
      const dest = trickPos(seat, me, seats)
      obj.kind = 'trick'
      obj.illegal = false
      if (card) {
        obj.face = true
        obj.card = card
      }
      obj.fromCenter = false
      obj.duration = 0.28
      obj.yaw = seat % 2 === 0 ? 6 : -5
      obj.x = dest.x
      obj.y = dest.y
      e.trick.push(obj)
    }

    function runDeal() {
      e.dealGen += 1
      const gen = e.dealGen
      e.dealing = true
      clearGroup(e.hand)
      for (const list of e.opp) clearGroup(list)
      clearGroup(e.trick)
      clearGroup(e.won)
      clearGroup(e.reveal)
      e.revealing = false
      e.prevTrickLen = 0
      e.prevWinsLen = 0
      flush()
      let n = 0
      for (let r = 0; r < 3; r++) {
        for (let s = 0; s < seats; s++) {
          const delay = n * 80
          const seat = s
          const i = r
          const fromRotate = ((n % 7) - 3) * 4
          n += 1
          window.setTimeout(() => {
            if (gen !== e.dealGen) return
            if (seat === me && me >= 0) {
              const live = liveHand()
              const nextCard = live.find((c) => !handHasId(cardId(c)) && !tableHas(c))
              if (!nextCard) return
              const obj = makeCard(WIDTH / 2, HEIGHT / 2, 'local', nextCard, true, {
                fromCenter: true,
                fromRotate,
                duration: 0.4,
              })
              e.hand.push(obj)
              restackHand(0.4)
              flush()
            } else {
              const dest = oppRest(seat, i, 3, me, seats)
              const obj = makeCard(dest.x, dest.y, 'back', null, false, {
                fromCenter: true,
                fromRotate,
                duration: 0.4,
              })
              e.opp[seat].push(obj)
              flush()
            }
          }, delay)
        }
      }
      window.setTimeout(() => {
        if (gen !== e.dealGen) return
        e.dealing = false
        reconcileHand()
        dimLocal()
      }, n * 80 + 350)
    }

    function flyToTrick(play: { seat: number; card: CardData }) {
      if (e.trick.some((o) => o.card && sameCard(o.card, play.card))) {
        return
      }
      if (e.won.some((o) => o.card && sameCard(o.card, play.card))) {
        return
      }
      let obj: VizCard | null = null
      if (play.seat === me) {
        const idx = e.hand.findIndex((o) => o.card && sameCard(o.card, play.card))
        if (idx >= 0) {
          obj = e.hand[idx] || null
          if (obj) e.hand.splice(idx, 1)
          restackHand()
        }
      } else {
        const pile = e.opp[play.seat]
        obj = pile && pile.length ? pile.pop()! : null
      }
      if (!obj) {
        const dest = trickPos(play.seat, me, seats)
        obj = makeCard(dest.x, dest.y, 'trick', play.card, true, {
          duration: 0.28,
          yaw: play.seat % 2 === 0 ? 6 : -5,
        })
        e.trick.push(obj)
      } else {
        placeInTrick(obj, play.seat, play.card)
      }
    }

    function ingestOppPlays() {
      const left = pub.cardsLeft || []
      for (let s = 0; s < seats; s++) {
        if (s === me) continue
        const pile = e.opp[s]
        if (!pile) continue
        const want = typeof left[s] === 'number' ? left[s]! : pile.length
        while (pile.length > want) {
          const obj = pile.pop()!
          placeInTrick(obj, s, obj.card)
        }
      }
    }

    function sweepTrick() {
      const last = pub.trickWins[pub.trickWins.length - 1]
      const mark: number | 'parda' = last === undefined ? 'parda' : last
      const moving = e.trick.slice()
      e.trick.length = 0
      const pileIndex = Math.max(0, pub.trickWins.length - 1)
      moving.forEach((o, i) => {
        const dest = wonPos(mark, pileIndex, i, me, seats, pub.turn)
        o.kind = 'won'
        o.illegal = false
        if (o.card) o.face = true
        o.fromCenter = false
        o.duration = 0.4
        o.yaw = dest.yaw
        o.x = dest.x
        o.y = dest.y
        e.won.push(o)
      })
    }

    function reconcileHand() {
      const live = liveHand()
      const liveIds = new Set(live.map(cardId))
      const staying: VizCard[] = []
      for (const o of e.hand) {
        if (o.card && liveIds.has(cardId(o.card)) && !tableHas(o.card)) staying.push(o)
        else if (o.card && !tableHas(o.card)) placeInTrick(o, me >= 0 ? me : 0, o.card)
      }
      e.hand = staying
      if (!e.dealing) {
        for (const c of live) {
          const id = cardId(c)
          if (handHasId(id) || tableHas(c)) continue
          const dest = localRest(e.hand.length, live.length)
          e.hand.push(makeCard(dest.x, dest.y, 'local', c, true, { duration: 0.32 }))
        }
      }
      restackHand()
    }

    function flipReveal() {
      if (e.revealing) return
      e.revealing = true
      clearGroup(e.reveal)
      for (const r of pub.reveal) {
        const vis = visOf(r.seat, me, seats)
        const a = seatAnchor(vis)
        r.cards.forEach((card, i) => {
          const dest = { x: a.x - 20 + i * 44, y: a.y - 90 }
          const obj = makeCard(dest.x, dest.y, 'reveal', card, true, { duration: 0.32 })
          e.reveal.push(obj)
        })
      }
    }

    if (pub.sfx === 'deal' && typeof pub.sfxN === 'number' && pub.sfxN !== e.lastDealN) {
      e.lastDealN = pub.sfxN
      runDeal()
    }
    if (pub.sfx === 'chant' && typeof pub.sfxN === 'number' && pub.sfxN !== e.lastChantN) {
      e.lastChantN = pub.sfxN
      if (pub.lastChant === 'truco' || pub.lastChant === 'retruco' || pub.lastChant === 'vale') {
        const node = feltScope.current
        if (node) {
          void animateFeltRef.current(
            node,
            { x: [0, -14, 8, 0] },
            { duration: 0.2, ease: 'easeOut', type: 'tween' },
          )
        }
      }
    }

    const winsLen = pub.trickWins.length
    const trickEnded = pub.trick.length === 0 && (e.prevTrickLen > 0 || winsLen > e.prevWinsLen)

    if (pub.trick.length > e.prevTrickLen) {
      for (const play of pub.trick.slice(e.prevTrickLen)) {
        if (play) flyToTrick(play)
      }
    }

    reconcileHand()
    ingestOppPlays()

    if (trickEnded && e.trick.length > 0) {
      sweepTrick()
    }

    e.prevTrickLen = pub.trick.length
    e.prevWinsLen = winsLen

    if (pub.reveal && pub.reveal.length > 0) flipReveal()
    else if (e.revealing && (!pub.reveal || pub.reveal.length === 0)) {
      clearGroup(e.reveal)
      e.revealing = false
    }
    dimLocal()
  }, [view])

  const pub = view.lastPub
  let banner = pub?.log || ''
  if (pub && pub.winnerTeam !== null) banner = t('teamWins', { team: pub.winnerTeam })
  else if (pub?.pending) {
    const chant = chantLabel(pub.pending.ladder[pub.pending.ladder.length - 1] || pub.lastChant || '')
    banner = `${chant}  want ${pub.pending.want} / no ${pub.pending.no}`
  }
  const tw = (pub?.trickWins || []).map((x) => (x === 'parda' ? 'P' : `T${x}`)).join(' ')
  const pts = pub?.handPoints ?? 1
  const meta = tw ? `tricks ${tw}   hand ${pts}pt` : `hand ${pts}pt`

  return (
    <div
      id="felt"
      ref={feltScope}
      style={{ backgroundImage: `url("${publicUrl('ui/table-felt.png')}")` }}
    >
      <img
        id="tableFrame"
        alt=""
        aria-hidden="true"
        src={publicUrl('ui/table-frame.png')}
      />
      <div id="tableLog">{banner}</div>
      <div id="cardLayer">
        <AnimatePresence>
          {cards.map((viz) => (
            <CardView
              key={viz.id}
              viz={viz}
              onPlay={(id) => {
                const vizCard = engine.current.hand.find((c) => c.id === id)
                if (!vizCard?.card) return
                const idx = viewRef.current.myHand.findIndex((c) => sameCard(c, vizCard.card!))
                if (idx >= 0) onPlayRef.current(idx)
              }}
            />
          ))}
        </AnimatePresence>
      </div>
      <div id="trickMeta">{meta}</div>
    </div>
  )
}
