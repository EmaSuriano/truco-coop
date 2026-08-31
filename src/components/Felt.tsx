import { useEffect, useRef, useState } from 'react'
import { WIDTH, HEIGHT } from '../config'
import type { Card as CardData } from '../deck'
import { actorSeat, chantLabel } from '../game'
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
  reveal: VizCard[]
  flying: VizCard[]
  prevTrickLen: number
  lastDealN: number
  lastChantN: number
  revealing: boolean
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
  const cy = HEIGHT / 2 + (vis === 0 ? 52 : vis === 2 ? -52 : 0) - 10
  return { x: cx, y: cy }
}

function localLegal(view: ViewState): string[] {
  if (view.mySeat < 0) return []
  if (view.lastPub && view.lastPub.legal[view.mySeat]) return view.lastPub.legal[view.mySeat]!
  return []
}

export function Felt({ view, onPlay }: { view: ViewState; onPlay: (i: number) => void }) {
  useLocale()
  const [cards, setCards] = useState<VizCard[]>([])
  const [shake, setShake] = useState(false)
  const engine = useRef<Engine>({
    hand: [],
    opp: [[], [], [], []],
    trick: [],
    reveal: [],
    flying: [],
    prevTrickLen: 0,
    lastDealN: -1,
    lastChantN: -1,
    revealing: false,
    dealGen: 0,
    nid: 0,
  })
  const onPlayRef = useRef(onPlay)
  onPlayRef.current = onPlay
  const viewRef = useRef(view)
  viewRef.current = view

  function flush() {
    const e = engine.current
    setCards([...e.hand.filter(Boolean), ...e.opp.flat(), ...e.trick, ...e.reveal])
  }

  function makeCard(
    x: number,
    y: number,
    kind: VizCard['kind'],
    card: CardData | null,
    face: boolean,
  ): VizCard {
    engine.current.nid += 1
    return {
      id: 'c' + engine.current.nid,
      x,
      y,
      kind,
      card,
      face,
      illegal: false,
      flipMid: false,
      noTrans: false,
    }
  }

  function clearGroup(list: VizCard[]) {
    list.length = 0
  }

  useEffect(() => {
    if (!view.lastPub) return
    const pub = view.lastPub
    const e = engine.current
    const seats = pub.seatCount === 4 ? 4 : pub.seatCount === 2 ? 2 : 2
    const me = view.mySeat
    const hand = view.myHand

    function dimLocal() {
      const can = localLegal(viewRef.current).includes('play')
      for (const o of e.hand) {
        if (o) o.illegal = !can
      }
      flush()
    }

    function spawnAtCenterThen(obj: VizCard, dest: { x: number; y: number }) {
      obj.noTrans = true
      obj.x = WIDTH / 2
      obj.y = HEIGHT / 2
      flush()
      window.requestAnimationFrame(() => {
        obj.noTrans = false
        obj.x = dest.x
        obj.y = dest.y
        flush()
      })
    }

    function runDeal() {
      e.dealGen += 1
      const gen = e.dealGen
      clearGroup(e.hand)
      for (const list of e.opp) clearGroup(list)
      clearGroup(e.trick)
      clearGroup(e.reveal)
      clearGroup(e.flying)
      e.revealing = false
      e.prevTrickLen = 0
      flush()
      let n = 0
      for (let r = 0; r < 3; r++) {
        for (let s = 0; s < seats; s++) {
          const delay = n * 80
          const seat = s
          const i = r
          n += 1
          window.setTimeout(() => {
            if (gen !== e.dealGen) return
            if (seat === me && me >= 0) {
              const card = hand[i] || null
              const dest = localRest(i, 3)
              const obj = makeCard(WIDTH / 2, HEIGHT / 2, 'local', card, !!card)
              e.hand[i] = obj
              spawnAtCenterThen(obj, dest)
            } else {
              const dest = oppRest(seat, i, 3, me, seats)
              const obj = makeCard(WIDTH / 2, HEIGHT / 2, 'back', null, false)
              e.opp[seat].push(obj)
              spawnAtCenterThen(obj, dest)
            }
          }, delay)
        }
      }
      window.setTimeout(() => {
        if (gen !== e.dealGen) return
        dimLocal()
      }, n * 80 + 350)
    }

    function flyToTrick(play: { seat: number; card: CardData }) {
      const dest = trickPos(play.seat, me, seats)
      let obj: VizCard | null = null
      if (play.seat === me) {
        const idx = e.hand.findIndex(
          (o) => o && o.card && o.card.suit === play.card.suit && o.card.rank === play.card.rank,
        )
        const take = idx >= 0 ? idx : e.hand.length - 1
        obj = e.hand[take] || null
        if (obj) e.hand.splice(take, 1)
        const n = e.hand.length
        e.hand.forEach((o, i) => {
          const rest = localRest(i, n)
          o.x = rest.x
          o.y = rest.y
        })
      } else {
        const pile = e.opp[play.seat]
        obj = pile && pile.length ? pile.pop()! : null
      }
      if (!obj) {
        obj = makeCard(dest.x, dest.y, 'trick', play.card, true)
      } else {
        obj.kind = 'trick'
        obj.illegal = false
        obj.face = true
        obj.card = play.card
      }
      e.trick.push(obj)
      obj.x = dest.x
      obj.y = dest.y
      dimLocal()
    }

    function sweepTrick() {
      const last = pub.trickWins[pub.trickWins.length - 1]
      let dest = { x: WIDTH / 2, y: HEIGHT / 2 }
      if (last !== undefined && last !== 'parda') {
        const winSeat = typeof pub.turn === 'number' ? pub.turn : last
        dest = seatAnchor(visOf(winSeat, me, seats))
      }
      const moving = e.trick.slice()
      e.trick.length = 0
      e.flying = moving
      for (const o of moving) {
        o.x = dest.x
        o.y = dest.y
      }
      flush()
      window.setTimeout(() => {
        if (e.flying === moving) e.flying = []
        flush()
      }, 420)
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
          const obj = makeCard(dest.x, dest.y, 'reveal', null, false)
          obj.flipMid = true
          e.reveal.push(obj)
          window.setTimeout(() => {
            obj.card = card
            obj.face = true
            obj.flipMid = false
            flush()
          }, 120)
        })
      }
      flush()
    }

    if (pub.sfx === 'deal' && typeof pub.sfxN === 'number' && pub.sfxN !== e.lastDealN) {
      e.lastDealN = pub.sfxN
      runDeal()
    }
    if (hand.length > 0) {
      e.hand.forEach((o, i) => {
        if (!o || !hand[i] || o.face) return
        o.card = hand[i]!
        o.face = true
      })
    }
    if (pub.sfx === 'chant' && typeof pub.sfxN === 'number' && pub.sfxN !== e.lastChantN) {
      e.lastChantN = pub.sfxN
      if (pub.lastChant === 'truco' || pub.lastChant === 'retruco' || pub.lastChant === 'vale') {
        setShake(false)
        window.requestAnimationFrame(() => setShake(true))
      }
    }
    if (pub.trick.length > e.prevTrickLen) {
      const play = pub.trick[pub.trick.length - 1]
      if (play) flyToTrick(play)
    } else if (pub.trick.length === 0 && e.prevTrickLen > 0) {
      sweepTrick()
    }
    e.prevTrickLen = pub.trick.length
    if (pub.reveal && pub.reveal.length > 0) flipReveal()
    else if (e.revealing && (!pub.reveal || pub.reveal.length === 0)) {
      clearGroup(e.reveal)
      e.revealing = false
    }
    dimLocal()
  }, [view])

  const pub = view.lastPub
  const seats = pub?.seatCount === 4 ? 4 : 2
  const me = view.mySeat
  const actor = actorSeat(pub)
  let banner = pub?.log || ''
  if (pub && pub.winnerTeam !== null) banner = t('teamWins', { team: pub.winnerTeam })
  else if (pub?.pending) {
    const chant = chantLabel(pub.pending.ladder[pub.pending.ladder.length - 1] || pub.lastChant || '')
    banner = `${chant}  want ${pub.pending.want} / no ${pub.pending.no}`
  }
  const tw = (pub?.trickWins || []).map((x) => (x === 'parda' ? 'P' : `T${x}`)).join(' ')
  const pts = pub?.handPoints ?? 1
  const meta = tw ? `tricks ${tw}   hand ${pts}pt` : `hand ${pts}pt`

  const seatsUi = []
  if (pub) {
    for (let seat = 0; seat < seats; seat++) {
      const vis = visOf(seat, me, seats)
      const a = seatAnchor(vis)
      const you = seat === me
      const isActor = actor === seat
      const roles: string[] = []
      if (seat === pub.dealer) roles.push('pie')
      if (seat === pub.mano) roles.push('mano')
      const name = you ? `${t('you')} P${seat}` : `P${seat}`
      const tagY = vis === 0 ? a.y + 8 : a.y - 46
      seatsUi.push(
        <div
          key={'tag' + seat}
          className={'seat-tag' + (you ? ' you' : '') + (isActor ? ' actor' : '')}
          style={{ left: a.x, top: tagY }}
        >
          {name + (roles.length ? ' · ' + roles.join(' · ') : '')}
        </div>,
      )
      if (isActor) {
        seatsUi.push(
          <div key={'badge' + seat} className="seat-badge" style={{ left: a.x, top: tagY - 22 }}>
            {pub.pending ? t('answers') : t('plays')}
          </div>,
        )
      }
    }
  }

  return (
    <div
      id="felt"
      className={shake ? 'shake' : ''}
      style={{ backgroundImage: `url("${publicUrl('ui/table-felt.png')}")` }}
      onAnimationEnd={() => setShake(false)}
    >
      <div id="tableLog">{banner}</div>
      <div id="seatLayer">{seatsUi}</div>
      <div id="cardLayer">
        {cards.map((viz) => (
          <CardView
            key={viz.id}
            viz={viz}
            onPlay={(id) => {
              const idx = engine.current.hand.findIndex((c) => c && c.id === id)
              if (idx >= 0) onPlayRef.current(idx)
            }}
          />
        ))}
      </div>
      <div id="trickMeta">{meta}</div>
    </div>
  )
}
