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
  log?: string
  dealer?: number
  mano?: number
  turn?: number
  pending?: { kind: string; fromSeat: number; want: number; no: number; ladder: string[] } | null
  winnerTeam?: number | null
  legal?: string[][]
  handPoints?: number
}

type CardEl = {
  el: HTMLElement
  inner: HTMLElement
  img: HTMLImageElement
  fallback: HTMLElement
  card: Card | null
  face: boolean
  rest: { x: number; y: number }
}

const LOCAL_W = 72
const LOCAL_H = 100
const BACK_W = 36
const BACK_H = 50

export function installTable(
  root: HTMLElement,
  ctx: {
    visOf: (seat: number) => number
    seatAnchor: (vis: number) => { x: number; y: number }
    getSeats: () => number
    getSeat: () => number
    getHand: () => Card[]
    localLegal: () => string[]
    submitPlay: (i: number) => void
    cardLabel: (card: Card) => string
    publicUrl: (path: string) => string
    t: (key: 'you' | 'plays' | 'answers' | 'teamWins', vars?: Record<string, string | number>) => string
    chantLabel: (name: string) => string
  },
) {
  const tableLog = ensureLayer('tableLog')
  const seatLayer = ensureLayer('seatLayer')
  const cardLayer = ensureLayer('cardLayer')
  const trickMeta = ensureLayer('trickMeta')

  root.style.backgroundImage = `url("${ctx.publicUrl('ui/table-felt.png')}")`

  const handObjs: CardEl[] = []
  const oppObjs: CardEl[][] = [[], [], [], []]
  const trickObjs: CardEl[] = []
  let revealObjs: CardEl[] = []
  let prevTrickLen = 0
  let lastDealN = -1
  let lastChantN = -1
  let revealing = false
  let dealGen = 0

  function ensureLayer(id: string): HTMLElement {
    let el = root.querySelector<HTMLElement>('#' + id)
    if (!el) {
      el = document.createElement('div')
      el.id = id
      root.append(el)
    }
    return el
  }

  function setPos(el: HTMLElement, x: number, y: number) {
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }

  function applyFace(obj: CardEl, card: Card | null, face: boolean) {
    obj.card = card
    obj.face = face
    const url =
      face && card
        ? ctx.publicUrl(`cards/${card.suit}-${card.rank}.png`)
        : ctx.publicUrl('cards/back.png')
    obj.img.style.display = 'block'
    obj.fallback.style.display = 'none'
    if (face && card) {
      const label = ctx.cardLabel(card)
      obj.img.alt = label
      obj.fallback.textContent = label
      obj.fallback.classList.toggle('red', card.suit === 'oro' || card.suit === 'copa')
      obj.fallback.classList.remove('is-back')
    } else {
      obj.img.alt = ''
      obj.fallback.textContent = ''
      obj.fallback.classList.add('is-back')
      obj.fallback.classList.remove('red')
    }
    obj.img.src = url
  }

  function makeCard(
    x: number,
    y: number,
    kind: 'local' | 'back' | 'trick' | 'reveal',
    card: Card | null,
    face: boolean,
  ): CardEl {
    const el = document.createElement('div')
    el.className = 'card'
    if (kind === 'local') el.classList.add('local')
    if (kind === 'back') el.classList.add('back')
    if (kind === 'trick') el.classList.add('trick')
    if (kind === 'reveal') el.classList.add('reveal')
    setPos(el, x, y)

    const inner = document.createElement('div')
    inner.className = 'card-inner'

    const img = document.createElement('img')
    img.alt = ''
    img.draggable = false

    const fallback = document.createElement('div')
    fallback.className = 'card-fallback'

    img.addEventListener('error', () => {
      img.style.display = 'none'
      fallback.style.display = 'flex'
    })
    img.addEventListener('load', () => {
      img.style.display = 'block'
      fallback.style.display = 'none'
    })

    inner.append(img, fallback)
    el.append(inner)
    cardLayer.append(el)

    const obj: CardEl = {
      el,
      inner,
      img,
      fallback,
      card: null,
      face: false,
      rest: { x, y },
    }
    applyFace(obj, card, face)
    return obj
  }

  function destroyObj(obj: CardEl | null) {
    if (!obj) return
    obj.el.remove()
  }

  function clearGroup(list: CardEl[]) {
    for (const o of list) destroyObj(o)
    list.length = 0
  }

  function localRest(i: number, n: number) {
    const gap = 12
    const total = n * LOCAL_W + Math.max(0, n - 1) * gap
    const x0 = WIDTH / 2 - total / 2
    return { x: x0 + i * (LOCAL_W + gap) + LOCAL_W / 2, y: HEIGHT - 148 + LOCAL_H / 2 }
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
      return { x: a.x, y: y0 + i * (h + gap) + h / 2 }
    }
    const total = n * w + Math.max(0, n - 1) * gap
    const x0 = a.x - total / 2
    return { x: x0 + i * (w + gap) + w / 2, y: a.y }
  }

  function trickPos(seat: number) {
    const vis = ctx.visOf(seat)
    const cx = WIDTH / 2 + (vis === 1 ? -70 : vis === 3 ? 70 : 0)
    const cy = HEIGHT / 2 + (vis === 0 ? 52 : vis === 2 ? -52 : 0) - 10
    return { x: cx, y: cy }
  }

  function moveTo(obj: CardEl, dest: { x: number; y: number }) {
    obj.rest = dest
    setPos(obj.el, dest.x, dest.y)
  }

  function spawnAtCenterThen(obj: CardEl, dest: { x: number; y: number }) {
    obj.el.style.transition = 'none'
    setPos(obj.el, WIDTH / 2, HEIGHT / 2)
    void obj.el.offsetWidth
    obj.el.style.transition = ''
    moveTo(obj, dest)
  }

  function bindLocal(obj: CardEl) {
    obj.el.addEventListener('click', () => {
      if (!ctx.localLegal().includes('play')) return
      const idx = handObjs.indexOf(obj)
      if (idx >= 0) ctx.submitPlay(idx)
    })
  }

  function dimLocal() {
    const can = ctx.localLegal().includes('play')
    for (const o of handObjs) {
      o.el.classList.toggle('illegal', !can)
    }
  }

  function runDeal() {
    dealGen += 1
    const gen = dealGen
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
        const delay = n * 80
        const seat = s
        const i = r
        n += 1
        window.setTimeout(() => {
          if (gen !== dealGen) return
          if (seat === me && me >= 0) {
            const card = hand[i] || null
            const dest = localRest(i, 3)
            const obj = makeCard(WIDTH / 2, HEIGHT / 2, 'local', card, !!card)
            bindLocal(obj)
            handObjs[i] = obj
            spawnAtCenterThen(obj, dest)
          } else {
            const dest = oppRest(seat, i, 3)
            const obj = makeCard(WIDTH / 2, HEIGHT / 2, 'back', null, false)
            oppObjs[seat].push(obj)
            spawnAtCenterThen(obj, dest)
          }
        }, delay)
      }
    }
    window.setTimeout(() => {
      if (gen !== dealGen) return
      dimLocal()
    }, n * 80 + 350)
  }

  function flyToTrick(play: { seat: number; card: Card }) {
    const dest = trickPos(play.seat)
    const me = ctx.getSeat()
    let obj: CardEl | null = null
    if (play.seat === me) {
      const idx = handObjs.findIndex(
        (o) => o && o.card && o.card.suit === play.card.suit && o.card.rank === play.card.rank,
      )
      const take = idx >= 0 ? idx : handObjs.length - 1
      obj = handObjs[take] || null
      if (obj) handObjs.splice(take, 1)
      const n = handObjs.length
      handObjs.forEach((o, i) => {
        moveTo(o, localRest(i, n))
      })
    } else {
      const pile = oppObjs[play.seat]
      obj = pile && pile.length ? pile.pop()! : null
    }
    if (!obj) {
      obj = makeCard(dest.x, dest.y, 'trick', play.card, true)
    } else {
      obj.el.classList.remove('local', 'back', 'illegal')
      obj.el.classList.add('trick')
      applyFace(obj, play.card, true)
    }
    trickObjs.push(obj)
    moveTo(obj, dest)
    dimLocal()
  }

  function sweepTrick(pub: TablePub) {
    const last = pub.trickWins[pub.trickWins.length - 1]
    let dest = { x: WIDTH / 2, y: HEIGHT / 2 }
    if (last !== undefined && last !== 'parda') {
      dest = ctx.seatAnchor(ctx.visOf(last))
    }
    const moving = trickObjs.slice()
    trickObjs.length = 0
    for (const o of moving) moveTo(o, dest)
    window.setTimeout(() => {
      for (const o of moving) destroyObj(o)
    }, 420)
  }

  function flipReveal(pub: TablePub) {
    if (revealing) return
    revealing = true
    clearGroup(revealObjs)
    for (const r of pub.reveal) {
      const vis = ctx.visOf(r.seat)
      const a = ctx.seatAnchor(vis)
      r.cards.forEach((card, i) => {
        const dest = { x: a.x - 20 + i * 44, y: a.y - 90 }
        const obj = makeCard(dest.x, dest.y, 'reveal', null, false)
        revealObjs.push(obj)
        obj.el.classList.add('flip-mid')
        window.setTimeout(() => {
          applyFace(obj, card, true)
          obj.el.classList.remove('flip-mid')
        }, 120)
      })
    }
  }

  function punchTruco(chant: string) {
    if (chant === 'truco' || chant === 'retruco' || chant === 'vale') {
      root.classList.remove('shake')
      void root.offsetWidth
      root.classList.add('shake')
      root.addEventListener('animationend', () => root.classList.remove('shake'), { once: true })
    }
  }

  function actorOf(pub: TablePub | null): number | null {
    if (!pub || pub.winnerTeam != null) return null
    if (pub.phase === 'wait' || pub.phase === 'done' || pub.phase === 'between') return null
    if (pub.pending) {
      const seats = ctx.getSeats()
      for (let s = 0; s < seats; s++) {
        const legal = pub.legal?.[s] || []
        if (legal.includes('quiero') || legal.includes('no')) return s
      }
      return null
    }
    if (pub.phase === 'play') return typeof pub.turn === 'number' ? pub.turn : null
    return null
  }

  function renderSeats(pub: TablePub) {
    seatLayer.replaceChildren()
    const seats = ctx.getSeats()
    const me = ctx.getSeat()
    const actor = actorOf(pub)
    for (let seat = 0; seat < seats; seat++) {
      const vis = ctx.visOf(seat)
      const a = ctx.seatAnchor(vis)
      const you = seat === me
      const isActor = actor === seat
      const tag = document.createElement('div')
      tag.className = 'seat-tag' + (you ? ' you' : '') + (isActor ? ' actor' : '')
      const name = you ? `${ctx.t('you')} P${seat}` : `P${seat}`
      const roles: string[] = []
      if (seat === pub.dealer) roles.push('pie')
      if (seat === pub.mano) roles.push('mano')
      tag.textContent = name + (roles.length ? ' · ' + roles.join(' · ') : '')
      const tagY = vis === 0 ? a.y + 8 : a.y - 46
      setPos(tag, a.x, tagY)
      seatLayer.append(tag)
      if (isActor) {
        const badge = document.createElement('div')
        badge.className = 'seat-badge'
        badge.textContent = pub.pending ? ctx.t('answers') : ctx.t('plays')
        setPos(badge, a.x, tagY - 22)
        seatLayer.append(badge)
      }
    }
  }

  function renderLog(pub: TablePub) {
    let banner = pub.log || ''
    if (pub.winnerTeam !== null && pub.winnerTeam !== undefined) {
      banner = ctx.t('teamWins', { team: pub.winnerTeam })
    } else if (pub.pending) {
      const chant = ctx.chantLabel(pub.pending.ladder[pub.pending.ladder.length - 1] || pub.lastChant || '')
      banner = `${chant}  want ${pub.pending.want} / no ${pub.pending.no}`
    }
    tableLog.textContent = banner
    const tw = (pub.trickWins || []).map((x) => (x === 'parda' ? 'P' : `T${x}`)).join(' ')
    const pts = pub.handPoints ?? 1
    trickMeta.textContent = tw ? `tricks ${tw}   hand ${pts}pt` : `hand ${pts}pt`
  }

  function sync(pub: TablePub | null) {
    if (!pub) return
    renderLog(pub)
    renderSeats(pub)
    if (pub.sfx === 'deal' && typeof pub.sfxN === 'number' && pub.sfxN !== lastDealN) {
      lastDealN = pub.sfxN
      runDeal()
    }
    const hand = ctx.getHand()
    if (hand.length > 0) {
      handObjs.forEach((o, i) => {
        if (!o || !hand[i] || o.face) return
        applyFace(o, hand[i]!, true)
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
