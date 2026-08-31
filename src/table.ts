import { WIDTH, HEIGHT } from './config'
import type { Card } from './deck'

export type TablePub = {
  trick: { seat: number; card: Card }[]
  cardsLeft: number[]
  lastChant: string
  trickWins: (number | 'parda')[]
  reveal: { seat: number; cards: Card[] }[]
  sfx?: string
  sfxN?: number
  phase: string
}

type K = any
type Obj = any

const LOCAL_W = 72
const LOCAL_H = 100
const BACK_W = 36
const BACK_H = 50
const TRICK_W = 56
const TRICK_H = 80

export function installTable(
  k: K,
  ctx: {
    visOf: (seat: number) => number
    seatAnchor: (vis: number) => { x: number; y: number }
    getSeats: () => number
    getSeat: () => number
    getHand: () => Card[]
    localLegal: () => string[]
    submitPlay: (i: number) => void
    cardLabel: (card: Card) => string
    hexColor: (hex: string) => unknown
  },
) {
  let felt: Obj | null = null
  const handObjs: Obj[] = []
  const oppObjs: Obj[][] = [[], [], [], []]
  const trickObjs: Obj[] = []
  let revealObjs: Obj[] = []
  let prevTrickLen = 0
  let lastDealN = -1
  let lastChantN = -1
  let revealing = false

  function hasSprite(name: string): boolean {
    try {
      const a = k.getSprite(name)
      return !!(a && (a.data || a.loaded !== false))
    } catch {
      return false
    }
  }

  function ensureFelt() {
    if (hasSprite('felt')) {
      if (felt && felt._feltSprite && felt.exists()) return
      destroyObj(felt)
      felt = k.add([k.sprite('felt', { width: WIDTH, height: HEIGHT }), k.pos(0, 0), k.anchor('topleft'), k.z(0)])
      felt._feltSprite = true
      return
    }
    if (felt && felt.exists()) return
    felt = k.add([
      k.rect(WIDTH, HEIGHT),
      k.pos(0, 0),
      k.anchor('topleft'),
      k.color(k.rgb(74, 18, 24)),
      k.z(0),
    ])
  }

  function spriteName(card: Card | null, face: boolean): string {
    if (!face || !card) return 'card-back'
    return 'card-' + card.suit + '-' + card.rank
  }

  function makeCard(x: number, y: number, w: number, h: number, card: Card | null, face: boolean, z: number): Obj {
    const name = spriteName(card, face)
    const comps: unknown[] = []
    if (hasSprite(name)) {
      comps.push(k.sprite(name, { width: w, height: h }))
    } else {
      const fill = face ? '#f4ecd0' : '#7a1f2b'
      const line = face ? '#2a2418' : '#2a1014'
      comps.push(k.rect(w, h, { radius: 6 }))
      comps.push(k.color(ctx.hexColor(fill)))
      comps.push(k.outline(2, ctx.hexColor(line)))
    }
    comps.push(k.pos(x, y), k.anchor('center'), k.area(), k.scale(1), k.z(z), k.opacity(1), k.timer(), 'table-card')
    const obj = k.add(comps)
    obj._w = w
    obj._h = h
    obj._card = card
    obj._face = face
    obj._rest = k.vec2(x, y)
    if (face && card && !hasSprite(name)) {
      const red = card.suit === 'oro' || card.suit === 'copa'
      obj.add([
        k.text(ctx.cardLabel(card), { size: w > 50 ? 22 : 14 }),
        k.anchor('center'),
        k.color(ctx.hexColor(red ? '#c0392b' : '#1b1b1b')),
      ])
    }
    return obj
  }

  function setFace(obj: Obj, card: Card | null, face: boolean, w: number, h: number) {
    const name = spriteName(card, face)
    obj._card = card
    obj._face = face
    obj._w = w
    obj._h = h
    if (typeof obj.unuse === 'function') {
      try { obj.unuse('sprite') } catch { /* ok */ }
      try { obj.unuse('rect') } catch { /* ok */ }
    }
    if (hasSprite(name)) {
      obj.use(k.sprite(name, { width: w, height: h }))
    }
  }

  function destroyObj(obj: Obj | null) {
    if (!obj) return
    try { if (obj.exists && obj.exists()) obj.destroy() } catch { /* ok */ }
  }

  function clearGroup(list: Obj[]) {
    for (const o of list) destroyObj(o)
    list.length = 0
  }

  function localRest(i: number, n: number) {
    const gap = 12
    const total = n * LOCAL_W + Math.max(0, n - 1) * gap
    const x0 = WIDTH / 2 - total / 2
    return k.vec2(x0 + i * (LOCAL_W + gap) + LOCAL_W / 2, HEIGHT - 148 + LOCAL_H / 2)
  }

  function oppRest(seat: number, i: number, n: number) {
    const vis = ctx.visOf(seat)
    const a = ctx.seatAnchor(vis)
    const gap = 6
    const w = BACK_W
    const h = BACK_H
    if (vis === 1 || vis === 3) {
      const total = n * h + Math.max(0, n - 1) * gap
      const y0 = a.y - total / 2
      return k.vec2(a.x, y0 + i * (h + gap) + h / 2)
    }
    const total = n * w + Math.max(0, n - 1) * gap
    const x0 = a.x - total / 2
    return k.vec2(x0 + i * (w + gap) + w / 2, a.y)
  }

  function trickPos(seat: number) {
    const vis = ctx.visOf(seat)
    const cx = WIDTH / 2 + (vis === 1 ? -70 : vis === 3 ? 70 : 0)
    const cy = HEIGHT / 2 + (vis === 0 ? 52 : vis === 2 ? -52 : 0) - 10
    return k.vec2(cx, cy)
  }

  function bindLocal(obj: Obj, i: number) {
    obj.onHover(() => {
      if (!ctx.localLegal().includes('play')) return
      obj.z = 40
      k.tween(obj.pos.y, obj._rest.y - 16, 0.12, (v: number) => { obj.pos.y = v }, k.easings.easeOutQuad)
      k.tween(obj.scale.x, 1.08, 0.12, (v: number) => { obj.scale = k.vec2(v, v) }, k.easings.easeOutQuad)
    })
    obj.onHoverEnd(() => {
      obj.z = 20
      k.tween(obj.pos, obj._rest, 0.12, (p: unknown) => { obj.pos = p }, k.easings.easeOutQuad)
      k.tween(obj.scale.x, 1, 0.12, (v: number) => { obj.scale = k.vec2(v, v) }, k.easings.easeOutQuad)
    })
    obj.onClick(() => {
      if (!ctx.localLegal().includes('play')) return
      const idx = handObjs.indexOf(obj)
      if (idx >= 0) ctx.submitPlay(idx)
    })
  }

  function dimLocal() {
    const can = ctx.localLegal().includes('play')
    for (const o of handObjs) {
      if (!o || !o.exists()) continue
      o.opacity = can ? 1 : 0.4
    }
  }

  function runDeal(pub: TablePub) {
    clearGroup(handObjs)
    for (const list of oppObjs) clearGroup(list)
    clearGroup(trickObjs)
    clearGroup(revealObjs)
    revealing = false
    prevTrickLen = 0
    const seats = ctx.getSeats()
    const me = ctx.getSeat()
    const hand = ctx.getHand()
    let n = 0
    for (let r = 0; r < 3; r++) {
      for (let s = 0; s < seats; s++) {
        const delay = n * 0.08
        const seat = s
        const i = r
        n += 1
        k.wait(delay, () => {
          const from = k.vec2(WIDTH / 2, HEIGHT / 2)
          if (seat === me && me >= 0) {
            const card = hand[i] || null
            const dest = localRest(i, 3)
            const obj = makeCard(from.x, from.y, LOCAL_W, LOCAL_H, card, !!card, 20)
            obj._rest = dest
            bindLocal(obj, i)
            handObjs[i] = obj
            k.tween(obj.pos, dest, 0.32, (p: unknown) => { obj.pos = p }, k.easings.easeOutQuad)
          } else {
            const dest = oppRest(seat, i, 3)
            const obj = makeCard(from.x, from.y, BACK_W, BACK_H, null, false, 10)
            obj._rest = dest
            oppObjs[seat].push(obj)
            k.tween(obj.pos, dest, 0.32, (p: unknown) => { obj.pos = p }, k.easings.easeOutQuad)
          }
        })
      }
    }
    k.wait(n * 0.08 + 0.35, () => dimLocal())
    void pub
  }

  function flyToTrick(play: { seat: number; card: Card }) {
    const dest = trickPos(play.seat)
    const me = ctx.getSeat()
    let obj: Obj | null = null
    if (play.seat === me) {
      const idx = handObjs.findIndex((o) => o && o._card && o._card.suit === play.card.suit && o._card.rank === play.card.rank)
      const take = idx >= 0 ? idx : handObjs.length - 1
      obj = handObjs[take] || null
      if (obj) handObjs.splice(take, 1)
      const n = handObjs.length
      handObjs.forEach((o, i) => {
        if (!o || !o.exists()) return
        o._rest = localRest(i, n)
        k.tween(o.pos, o._rest, 0.18, (p: unknown) => { o.pos = p }, k.easings.easeOutQuad)
      })
    } else {
      const pile = oppObjs[play.seat]
      obj = pile && pile.length ? pile.pop() : null
    }
    if (!obj || !obj.exists()) {
      obj = makeCard(dest.x, dest.y, TRICK_W, TRICK_H, play.card, true, 30)
    } else {
      setFace(obj, play.card, true, TRICK_W, TRICK_H)
      obj.z = 30
    }
    trickObjs.push(obj)
    k.tween(obj.pos, dest, 0.28, (p: unknown) => { obj.pos = p }, k.easings.easeOutQuad)
    k.tween(1, 1, 0.01, () => {}, k.easings.linear)
    dimLocal()
  }

  function sweepTrick(pub: TablePub) {
    const last = pub.trickWins[pub.trickWins.length - 1]
    let dest = k.vec2(WIDTH / 2, HEIGHT / 2)
    if (last !== undefined && last !== 'parda') {
      const a = ctx.seatAnchor(ctx.visOf(last))
      dest = k.vec2(a.x, a.y)
    }
    const moving = trickObjs.slice()
    trickObjs.length = 0
    for (const o of moving) {
      if (!o || !o.exists()) continue
      k.tween(o.pos, dest, 0.4, (p: unknown) => { o.pos = p }, k.easings.easeInQuad)
    }
    k.wait(0.42, () => {
      for (const o of moving) destroyObj(o)
    })
  }

  function flipReveal(pub: TablePub) {
    if (revealing) return
    revealing = true
    clearGroup(revealObjs)
    for (const r of pub.reveal) {
      const vis = ctx.visOf(r.seat)
      const a = ctx.seatAnchor(vis)
      r.cards.forEach((card, i) => {
        const dest = k.vec2(a.x - 20 + i * 44, a.y - 90)
        const obj = makeCard(dest.x, dest.y, 40, 56, null, false, 35)
        revealObjs.push(obj)
        k.tween(1, 0.02, 0.12, (v: number) => { obj.scale.x = v }, k.easings.easeInQuad)
        k.wait(0.12, () => {
          setFace(obj, card, true, 40, 56)
          k.tween(0.02, 1, 0.12, (v: number) => { obj.scale.x = v }, k.easings.easeOutQuad)
        })
      })
    }
  }

  function punchTruco(chant: string) {
    if (chant === 'truco' || chant === 'retruco' || chant === 'vale') {
      k.shake(18)
    }
  }

  function sync(pub: TablePub | null) {
    ensureFelt()
    if (!pub) return
    if (pub.sfx === 'deal' && typeof pub.sfxN === 'number' && pub.sfxN !== lastDealN) {
      lastDealN = pub.sfxN
      runDeal(pub)
    }
    const hand = ctx.getHand()
    if (hand.length > 0) {
      handObjs.forEach((o, i) => {
        if (!o || !hand[i] || o._face) return
        setFace(o, hand[i]!, true, LOCAL_W, LOCAL_H)
      })
    }
    if (pub.sfx === 'chant' && typeof pub.sfxN === 'number' && pub.sfxN !== lastChantN) {
      lastChantN = pub.sfxN
      punchTruco(pub.lastChant)
    }
    if (pub.trick.length > prevTrickLen) {
      const play = pub.trick[pub.trick.length - 1]
      if (play) flyToTrick(play)
    } else if (pub.trick.length === 0 && prevTrickLen > 0) {
      sweepTrick(pub)
    }
    prevTrickLen = pub.trick.length
    if (pub.reveal && pub.reveal.length > 0) flipReveal(pub)
    else if (revealing && (!pub.reveal || pub.reveal.length === 0)) {
      clearGroup(revealObjs)
      revealing = false
    }
    dimLocal()
  }

  return { sync }
}
