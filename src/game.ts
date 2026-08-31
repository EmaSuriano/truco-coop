import kaplay from 'kaplay'
import type { Room } from '@trystero-p2p/mqtt'
import {
  WIDTH,
  HEIGHT,
  MAX_SEATS,
  TEAM_COUNT,
  MALAS,
  HOST_COLOR,
  JOIN_COLOR,
  teamOf,
  nextSeat,
} from './config'
import {
  type Card,
  makeDeck,
  shuffle,
  trucoRank,
  envidoOf,
} from './deck'
import { t, onLocale } from './i18n'
import { installTable } from './table'

type ChantName = 'envido' | 'real' | 'falta' | 'truco' | 'retruco' | 'vale'
type ActName = ChantName | 'play' | 'quiero' | 'no'
type Phase = 'wait' | 'play' | 'pending' | 'between' | 'done'
type TrickMark = number | 'parda'

type Pending = {
  kind: 'envido' | 'truco'
  fromSeat: number
  want: number
  no: number
  ladder: string[]
}

type TrickPlay = { seat: number; card: Card }

type Reveal = { seat: number; cards: Card[] }

type Pub = {
  scores: number[]
  dealer: number
  mano: number
  turn: number
  phase: string
  trick: TrickPlay[]
  cardsLeft: number[]
  lastChant: string
  pending: Pending | null
  trickWins: TrickMark[]
  log: string
  winnerTeam: number | null
  seatsFilled: number
  seatCount: number
  target: number
  legal: string[][]
  reveal: Reveal[]
  handPoints: number
  sfx?: string
  sfxN?: number
}

type HelloMsg = { seat: number }
type HandMsg = { cards: Card[] }
type ActMsg =
  | { t: 'play'; i: number }
  | { t: 'chant'; name: ChantName }
  | { t: 'quiero' }
  | { t: 'no' }

const ENVIDO_NAMES: ChantName[] = ['envido', 'real', 'falta']
const TRUCO_NAMES: ChantName[] = ['truco', 'retruco', 'vale']

const SUIT_MARK: Record<Card['suit'], string> = {
  espada: 'E',
  basto: 'B',
  oro: 'O',
  copa: 'C',
}

const SUIT_RED: Record<Card['suit'], boolean> = {
  espada: false,
  basto: false,
  oro: true,
  copa: true,
}

const CHANT_LABEL: Record<ChantName, string> = {
  envido: 'Envido',
  real: 'Real Envido',
  falta: 'Falta Envido',
  truco: 'Truco',
  retruco: 'Retruco',
  vale: 'Vale cuatro',
}

const BTN_IDS: { name: ActName; id: string }[] = [
  { name: 'envido', id: 'btnEnvido' },
  { name: 'real', id: 'btnReal' },
  { name: 'falta', id: 'btnFalta' },
  { name: 'truco', id: 'btnTruco' },
  { name: 'retruco', id: 'btnRetruco' },
  { name: 'vale', id: 'btnVale' },
  { name: 'quiero', id: 'btnQuiero' },
  { name: 'no', id: 'btnNo' },
]

function emptyHands(): Card[][] {
  return Array.from({ length: MAX_SEATS }, () => [])
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0)
}

function emptyLegal(): string[][] {
  return Array.from({ length: MAX_SEATS }, () => [])
}

function faltaPts(scores: number[], callingTeam: number, target: number): number {
  if (target <= MALAS) {
    return Math.max(1, target - Math.max(...scores))
  }
  const allMalas = scores.every((s) => s < MALAS)
  if (allMalas) {
    const opponent = (callingTeam + 1) % TEAM_COUNT
    return target - scores[opponent]!
  }
  return target - Math.max(...scores)
}

function envidoWant(ladder: string[], scores: number[], callingTeam: number, target: number): number {
  if (ladder.includes('falta')) return faltaPts(scores, callingTeam, target)
  const key = ladder.join('+')
  if (key === 'envido') return 2
  if (key === 'real') return 3
  if (key === 'envido+envido') return 4
  if (key === 'envido+real') return 5
  if (key === 'envido+envido+real') return 7
  return 2
}

function envidoNo(ladder: string[], scores: number[], callingTeam: number, target: number): number {
  if (ladder.length <= 1) return 1
  return envidoWant(ladder.slice(0, -1), scores, callingTeam, target)
}

function trucoWant(ladder: string[]): number {
  if (ladder.includes('vale')) return 4
  if (ladder.includes('retruco')) return 3
  if (ladder.includes('truco')) return 2
  return 1
}

function trucoNo(ladder: string[]): number {
  if (ladder.includes('vale')) return 3
  if (ladder.includes('retruco')) return 2
  return 1
}

function envidoRaises(ladder: string[]): ChantName[] {
  if (ladder.includes('falta')) return []
  if (ladder.includes('real')) return ['falta']
  const nEnv = ladder.filter((x) => x === 'envido').length
  const out: ChantName[] = []
  if (nEnv < 2) out.push('envido')
  out.push('real', 'falta')
  return out
}

function trucoRaises(ladder: string[]): ChantName[] {
  if (ladder.includes('vale')) return []
  if (ladder.includes('retruco')) return ['vale']
  if (ladder.includes('truco')) return ['retruco']
  return ['truco']
}

function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_MARK[card.suit]}`
}

function chantLabel(name: string): string {
  return CHANT_LABEL[name as ChantName] || name
}

export function startGame(
  room: Room,
  opts: { isHost: boolean; canvas: HTMLCanvasElement; peerCountEl: HTMLElement; tableSize?: 2 | 4; targetScore?: 15 | 30 },
): void {
  const { isHost, canvas, peerCountEl } = opts
  let seats: 2 | 4 = opts.tableSize === 4 ? 4 : 2
  let target: 15 | 30 = opts.targetScore === 30 ? 30 : 15

  const k = kaplay({
    global: false,
    width: WIDTH,
    height: HEIGHT,
    letterbox: true,
    background: [42, 10, 14],
    crisp: true,
    canvas,
  })

  function publicUrl(path: string): string {
    const base = import.meta.env.BASE_URL || '/'
    return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`
  }

  let artReady = false
  k.loadSprite('felt', publicUrl('ui/table-felt.png'))
  k.loadSprite('card-back', publicUrl('cards/back.png'))
  for (const suit of ['espada', 'basto', 'oro', 'copa'] as const) {
    for (const rank of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const) {
      k.loadSprite(`card-${suit}-${rank}`, publicUrl(`cards/${suit}-${rank}.png`))
    }
  }
  const soundOk = new Set<string>()
  let bgmStarted = false
  let sfxName = ''
  let sfxN = 0
  let seenSfxN = 0

  function playSfx(name: string) {
    if (!name || name === 'bgm' || !soundOk.has(name)) return
    try {
      k.play(name, { volume: 0.7 })
    } catch {
      /* mute-safe */
    }
  }

  function startBgm() {
    if (bgmStarted || !soundOk.has('bgm')) return
    bgmStarted = true
    try {
      k.play('bgm', { loop: true, volume: 0.18 })
    } catch {
      bgmStarted = false
    }
  }

  function cue(name: string) {
    sfxName = name
    sfxN += 1
    playSfx(name)
  }

  k.onLoad(() => {
    artReady = true
    const files: [string, string][] = [
      ['bgm', 'bgm-loop.ogg'],
      ['deal', 'sfx-deal.ogg'],
      ['play', 'sfx-play-card.ogg'],
      ['chant', 'sfx-chant.ogg'],
      ['want', 'sfx-want.ogg'],
      ['no', 'sfx-no-quiero.ogg'],
      ['win-hand', 'sfx-win-hand.ogg'],
      ['win-match', 'sfx-win-match.ogg'],
    ]
    for (const [name, file] of files) {
      const url = publicUrl('audio/' + file)
      void fetch(url)
        .then((res) => {
          if (!res.ok) return
          k.loadSound(name, url)
          window.setTimeout(() => {
            soundOk.add(name)
            if (name === 'bgm') startBgm()
          }, 350)
        })
        .catch(() => {})
    }
  })

  const helloAction = room.makeAction<HelloMsg>('hello')
  const handAction = room.makeAction<HandMsg>('hand')
  const pubAction = room.makeAction<Pub>('pub')
  const actAction = room.makeAction<ActMsg>('act')
  const cfgAction = room.makeAction<{ n: 2 | 4; target: 15 | 30 }>('cfg')

  let mySeat = isHost ? 0 : -1
  let myHand: Card[] = []
  const hostHands: Card[][] | null = isHost ? emptyHands() : null
  const peerOfSeat: (string | null)[] = Array.from({ length: MAX_SEATS }, () => null)
  const seatOfPeer = new Map<string, number>()
  const peers = new Set<string>()

  let scores = zeros(TEAM_COUNT)
  let dealer = 0
  let mano = 1
  let turn = 1
  let phase: Phase = 'wait'
  let trick: TrickPlay[] = []
  let lastChant = ''
  let pending: Pending | null = null
  let heldTruco: Pending | null = null
  let trickWins: TrickMark[] = []
  let log = `Waiting ${1}/${seats}`
  let winnerTeam: number | null = null
  let reveal: Reveal[] = []
  let handPoints = 1
  let envidoDone = false
  let playedCard = Array.from({ length: MAX_SEATS }, () => false)
  let trucoLadder: string[] = []
  let trucoLastTeam = -1
  let dealGen = 0
  let lastPub: Pub | null = null

  function seatsFilled(): number {
    if (!isHost) return lastPub ? lastPub.seatsFilled : 1
    let n = 1
    for (let s = 1; s < seats; s++) if (peerOfSeat[s]) n += 1
    return n
  }

  function hexColor(hex: string) {
    if (k.Color && typeof k.Color.fromHex === 'function') {
      return k.Color.fromHex(hex)
    }
    const n = String(hex).replace('#', '')
    const r = parseInt(n.slice(0, 2), 16) || 0
    const g = parseInt(n.slice(2, 4), 16) || 0
    const b = parseInt(n.slice(4, 6), 16) || 0
    return k.rgb(r, g, b)
  }

  function refreshPeerCount() {
    peerCountEl.textContent = String(peers.size)
  }

  function cardsLeftNow(): number[] {
    if (hostHands) return Array.from({ length: seats }, (_, s) => hostHands[s]!.length)
    return lastPub ? lastPub.cardsLeft : zeros(seats)
  }

  function legalFor(seat: number): ActName[] {
    const out: ActName[] = []
    if (!isHost || !hostHands) return out
    if (winnerTeam !== null || phase === 'wait' || phase === 'between' || phase === 'done') {
      return out
    }
    if (seatsFilled() < seats) return out

    const myTeam = teamOf(seat, seats)
    const hasPlayed = playedCard[seat]
    const firstTrick = trickWins.length === 0
    const isTurn = turn === seat && pending === null
    const canEnvidoOpen = firstTrick && !hasPlayed && !envidoDone

    if (pending) {
      if (teamOf(pending.fromSeat, seats) !== myTeam) {
        out.push('quiero', 'no')
        if (pending.kind === 'envido') {
          for (const n of envidoRaises(pending.ladder)) out.push(n)
        } else {
          for (const n of trucoRaises(pending.ladder)) out.push(n)
        }
      }
      if (
        pending.kind === 'truco' &&
        canEnvidoOpen &&
        teamOf(pending.fromSeat, seats) !== myTeam
      ) {
        for (const n of ENVIDO_NAMES) {
          if (!out.includes(n)) out.push(n)
        }
      }
      return out
    }

    if (isTurn && hostHands[seat] && hostHands[seat]!.length > 0) out.push('play')
    if (isTurn && canEnvidoOpen) {
      for (const n of ENVIDO_NAMES) out.push(n)
    }
    if (isTurn) {
      if (trucoLadder.length === 0) out.push('truco')
      else if (trucoLastTeam !== myTeam) {
        for (const n of trucoRaises(trucoLadder)) out.push(n)
      }
    }
    return out
  }

  function allLegal(): string[][] {
    return Array.from({ length: seats }, (_, s) => legalFor(s))
  }

  function buildPub(): Pub {
    return {
      scores: scores.slice(),
      dealer,
      mano,
      turn,
      phase,
      trick: trick.map((p) => ({ seat: p.seat, card: { suit: p.card.suit, rank: p.card.rank } })),
      cardsLeft: cardsLeftNow(),
      lastChant,
      pending: pending
        ? {
            kind: pending.kind,
            fromSeat: pending.fromSeat,
            want: pending.want,
            no: pending.no,
            ladder: pending.ladder.slice(),
          }
        : null,
      trickWins: trickWins.slice(),
      log,
      winnerTeam,
      seatsFilled: seatsFilled(),
      seatCount: seats,
      target,
      legal: allLegal(),
      reveal: phase === 'between' || phase === 'done' ? reveal.map((r) => ({
        seat: r.seat,
        cards: r.cards.map((c) => ({ suit: c.suit, rank: c.rank })),
      })) : [],
      handPoints,
      sfx: sfxName,
      sfxN,
    }
  }

  function applyPub(pub: Pub) {
    if (pub.seatCount === 2 || pub.seatCount === 4) seats = pub.seatCount as 2 | 4
    if (pub.target === 15 || pub.target === 30) target = pub.target
    if (!isHost && pub.sfx && pub.sfxN && pub.sfxN !== seenSfxN) {
      seenSfxN = pub.sfxN
      playSfx(pub.sfx)
    }
    lastPub = pub
    refreshUi()
  }

  function broadcast() {
    if (!isHost) return
    const pub = buildPub()
    lastPub = pub
    void pubAction.send(pub)
    refreshUi()
  }

  function sendHandTo(seat: number) {
    if (!isHost || !hostHands) return
    if (seat === 0) {
      myHand = hostHands[0]!
      return
    }
    const peerId = peerOfSeat[seat]
    if (!peerId) return
    const cards = hostHands[seat]!.map((c) => ({ suit: c.suit, rank: c.rank }))
    void handAction.send({ cards }, { target: peerId })
  }

  function resetHandVars() {
    trick = []
    lastChant = ''
    pending = null
    heldTruco = null
    trickWins = []
    reveal = []
    handPoints = 1
    envidoDone = false
    playedCard = Array.from({ length: MAX_SEATS }, () => false)
    trucoLadder = []
    trucoLastTeam = -1
    winnerTeam = winnerTeam
  }

  function deal() {
    if (!isHost || !hostHands) return
    if (seatsFilled() < seats || winnerTeam !== null) return
    dealGen += 1
    resetHandVars()
    for (let s = 0; s < seats; s++) hostHands[s] = []
    const deck = shuffle(makeDeck())
    let i = 0
    for (let r = 0; r < 3; r++) {
      for (let s = 0; s < seats; s++) {
        const seat = (mano + s) % seats
        hostHands[seat]!.push(deck[i]!)
        i += 1
      }
    }
    myHand = hostHands[0]!
    for (let s = 1; s < seats; s++) sendHandTo(s)
    turn = mano
    phase = 'play'
    log = `Dealt. Mano P${mano}. Dealer (pie) P${dealer}.`
    cue('deal')
    broadcast()
  }

  function scheduleNextHand() {
    if (!isHost || winnerTeam !== null) return
    const gen = dealGen
    window.setTimeout(() => {
      if (gen !== dealGen || winnerTeam !== null) return
      dealer = nextSeat(dealer, seats)
      mano = nextSeat(dealer, seats)
      deal()
    }, 2800)
  }

  function endMatch(team: number) {
    winnerTeam = team
    phase = 'done'
    pending = null
    heldTruco = null
    log = `Team ${team} wins the match (${scores[0]}–${scores[1]}).`
    cue('win-match')
    broadcast()
  }

  function award(team: number, pts: number, why: string) {
    scores[team] = scores[team]! + pts
    log = why
    if (scores[team]! >= target) {
      endMatch(team)
      return true
    }
    return false
  }

  function finishHand(team: number, pts: number, why: string) {
    phase = 'between'
    pending = null
    heldTruco = null
    const over = award(team, pts, why)
    if (!over) {
      cue('win-hand')
      broadcast()
      scheduleNextHand()
    }
  }

  function envidoBest(): { seat: number; points: number; cards: Card[] } {
    let bestSeat = mano
    let bestPts = -1
    let bestCards: Card[] = []
    for (let i = 0; i < seats; i++) {
      const s = (mano + i) % seats
      const ev = envidoOf(hostHands ? hostHands[s]! : [])
      if (ev.points > bestPts) {
        bestPts = ev.points
        bestSeat = s
        bestCards = ev.cards
      }
    }
    return { seat: bestSeat, points: bestPts, cards: bestCards }
  }

  function resumeHeldTruco() {
    if (heldTruco && winnerTeam === null) {
      pending = heldTruco
      heldTruco = null
      phase = 'pending'
    } else {
      pending = null
      phase = winnerTeam === null ? 'play' : 'done'
    }
  }

  function resolveTrick() {
    if (!isHost) return
    const teamBest: { rank: number; seat: number }[] = Array.from(
      { length: TEAM_COUNT },
      () => ({ rank: -1, seat: -1 }),
    )
    for (const p of trick) {
      const t = teamOf(p.seat, seats)
      const r = trucoRank(p.card)
      if (r > teamBest[t]!.rank) teamBest[t] = { rank: r, seat: p.seat }
    }
    let maxR = -1
    const teamsAt: number[] = []
    for (let t = 0; t < TEAM_COUNT; t++) {
      const r = teamBest[t]!.rank
      if (r > maxR) {
        maxR = r
        teamsAt.length = 0
        teamsAt.push(t)
      } else if (r === maxR && maxR >= 0) {
        teamsAt.push(t)
      }
    }
    const leader = trick[0]!.seat
    trick = []
    if (teamsAt.length !== 1) {
      trickWins.push('parda')
      turn = leader
      log = `Emparda on trick ${trickWins.length}.`
    } else {
      const t = teamsAt[0]!
      trickWins.push(t)
      turn = teamBest[t]!.seat
      log = `P${turn} wins trick ${trickWins.length}.`
    }

    const hw = handWinnerFromTricks()
    if (hw !== null) {
      finishHand(hw, handPoints, `Team ${hw} wins the hand +${handPoints}.`)
      return
    }
    phase = 'play'
    broadcast()
  }

  function handWinnerFromTricks(): number | null {
    const w = trickWins
    if (w.length >= 2) {
      const a = w[0]
      const b = w[1]
      if (a === 'parda' && b !== 'parda') return b as number
      if (a !== 'parda' && b === 'parda') return a as number
      if (a !== 'parda' && b !== 'parda' && a === b) return a as number
    }
    if (w.length === 3) {
      const a = w[0]
      const b = w[1]
      const c = w[2]
      if (a === 'parda' && b === 'parda') {
        if (c === 'parda') return teamOf(mano, seats)
        return c as number
      }
      if (c === 'parda') {
        if (a !== 'parda') return a as number
        return teamOf(mano, seats)
      }
      return c as number
    }
    return null
  }

  function applyPlay(seat: number, i: number) {
    if (!isHost || !hostHands) return
    if (!legalFor(seat).includes('play')) return
    const hand = hostHands[seat]!
    if (i < 0 || i >= hand.length) return
    const card = hand.splice(i, 1)[0]
    if (!card) return
    if (seat === 0) myHand = hostHands[0]!
    trick.push({ seat, card })
    playedCard[seat] = true
    log = `P${seat} plays ${cardLabel(card)}.`
    cue('play')
    if (trick.length >= seats) resolveTrick()
    else {
      turn = nextSeat(turn, seats)
      phase = 'play'
      broadcast()
    }
  }

  function applyChant(seat: number, name: ChantName) {
    if (!isHost) return
    if (!legalFor(seat).includes(name)) return

    if (ENVIDO_NAMES.includes(name)) {
      if (pending && pending.kind === 'truco') {
        heldTruco = pending
        pending = null
      }
      const ladder =
        pending && pending.kind === 'envido' ? pending.ladder.concat(name) : [name]
      pending = {
        kind: 'envido',
        fromSeat: seat,
        want: envidoWant(ladder, scores, teamOf(seat, seats), target),
        no: envidoNo(ladder, scores, teamOf(seat, seats), target),
        ladder,
      }
      lastChant = name
      phase = 'pending'
      log = `P${seat}: ${chantLabel(name)} (${pending.want}/${pending.no}).`
      cue('chant')
      broadcast()
      return
    }

    if (!TRUCO_NAMES.includes(name)) return
    let ladder: string[]
    if (pending && pending.kind === 'truco') ladder = pending.ladder.concat(name)
    else if (trucoLadder.length > 0) ladder = trucoLadder.concat(name)
    else ladder = [name]
    pending = {
      kind: 'truco',
      fromSeat: seat,
      want: trucoWant(ladder),
      no: trucoNo(ladder),
      ladder,
    }
    trucoLastTeam = teamOf(seat, seats)
    lastChant = name
    phase = 'pending'
    log = `P${seat}: ${chantLabel(name)} (${pending.want}/${pending.no}).`
    cue('chant')
    broadcast()
  }

  function applyQuiero(seat: number) {
    if (!isHost || !pending) return
    if (!legalFor(seat).includes('quiero')) return
    if (pending.kind === 'envido') {
      const want = pending.want
      envidoDone = true
      const best = envidoBest()
      const team = teamOf(best.seat, seats)
      reveal = [{ seat: best.seat, cards: best.cards }]
      pending = null
      cue('want')
      const over = award(
        team,
        want,
        `P${best.seat} wins envido (${best.points}) +${want}. Reveal at end of hand.`,
      )
      if (over) return
      resumeHeldTruco()
      broadcast()
      return
    }
    handPoints = pending.want
    trucoLadder = pending.ladder.slice()
    trucoLastTeam = teamOf(pending.fromSeat, seats)
    pending = null
    phase = 'play'
    log = `P${seat}: Quiero. Hand is worth ${handPoints}.`
    cue('want')
    broadcast()
  }

  function applyNo(seat: number) {
    if (!isHost || !pending) return
    if (!legalFor(seat).includes('no')) return
    const from = pending.fromSeat
    const team = teamOf(from, seats)
    const pts = pending.no
    const kind = pending.kind
    pending = null
    cue('no')
    if (kind === 'envido') {
      envidoDone = true
      const over = award(team, pts, `P${seat}: No quiero. Team ${team} +${pts} (envido).`)
      if (over) return
      resumeHeldTruco()
      broadcast()
      return
    }
    finishHand(team, pts, `P${seat}: No quiero. Team ${team} +${pts} (truco).`)
  }

  function applyAct(seat: number, act: ActMsg) {
    if (!isHost || winnerTeam !== null) return
    if (act.t === 'play') applyPlay(seat, act.i)
    else if (act.t === 'chant') applyChant(seat, act.name)
    else if (act.t === 'quiero') applyQuiero(seat)
    else if (act.t === 'no') applyNo(seat)
  }

  function submitAct(act: ActMsg) {
    if (mySeat < 0) return
    if (isHost) applyAct(mySeat, act)
    else void actAction.send(act)
    if (!isHost && act.t === 'play') {
      if (act.i >= 0 && act.i < myHand.length) myHand.splice(act.i, 1)
    }
  }

  function assignSeat(peerId: string): number | null {
    for (let s = 1; s < seats; s++) {
      if (!peerOfSeat[s]) {
        peerOfSeat[s] = peerId
        seatOfPeer.set(peerId, s)
        return s
      }
    }
    return null
  }

  function greetPeer(peerId: string) {
    peers.add(peerId)
    refreshPeerCount()
    if (!isHost) return
    let seat = seatOfPeer.get(peerId)
    if (seat === undefined) {
      const assigned = assignSeat(peerId)
      if (assigned === null) {
        void cfgAction.send({ n: seats, target }, { target: peerId })
        log = `Spectator joined (${peers.size} peers). Table is full.`
        broadcast()
        return
      }
      seat = assigned
    }
    void cfgAction.send({ n: seats, target }, { target: peerId })
    void helloAction.send({ seat }, { target: peerId })
    if (hostHands && hostHands[seat] && hostHands[seat]!.length > 0) {
      sendHandTo(seat)
    }
    if (seatsFilled() >= seats && phase === 'wait') {
      dealer = 0
      mano = nextSeat(dealer, seats)
      deal()
    } else {
      log = `Waiting ${seatsFilled()}/${seats}`
      broadcast()
    }
  }

  room.onPeerJoin = (peerId) => {
    greetPeer(peerId)
  }

  room.onPeerLeave = (peerId) => {
    peers.delete(peerId)
    refreshPeerCount()
    if (isHost) {
      const seat = seatOfPeer.get(peerId)
      if (seat !== undefined) {
        peerOfSeat[seat] = null
        seatOfPeer.delete(peerId)
        log = `P${seat} left. Waiting to refill the table.`
        if (winnerTeam === null && phase !== 'wait' && phase !== 'done') {
          phase = 'wait'
        }
        broadcast()
      }
    }
  }

  cfgAction.onMessage = (data) => {
    if (isHost || !data) return
    if (data.n === 2 || data.n === 4) seats = data.n
    if (data.target === 15 || data.target === 30) target = data.target
  }

  helloAction.onMessage = (data) => {
    if (isHost) return
    if (data && typeof data.seat === 'number') {
      mySeat = data.seat
      refreshUi()
    }
  }

  handAction.onMessage = (data) => {
    if (isHost) return
    if (data && Array.isArray(data.cards)) {
      myHand = data.cards.map((c) => ({ suit: c.suit, rank: c.rank }))
      refreshUi()
    }
  }

  pubAction.onMessage = (data) => {
    if (isHost) return
    if (data) applyPub(data)
  }

  actAction.onMessage = (data, context) => {
    if (!isHost || !data) return
    const seat = seatOfPeer.get(context.peerId)
    if (seat === undefined) return
    applyAct(seat, data)
  }

  if (typeof room.getPeers === 'function') {
    const existing = room.getPeers() || {}
    const ids = Array.isArray(existing) ? existing : Object.keys(existing)
    for (const peerId of ids) greetPeer(peerId)
  }

  if (isHost) {
    lastPub = buildPub()
    refreshUi()
  }

  function localLegal(): string[] {
    if (mySeat < 0) return []
    if (lastPub && lastPub.legal[mySeat]) return lastPub.legal[mySeat]!
    return []
  }

  function actorSeat(pub: Pub | null): number | null {
    if (!pub || pub.winnerTeam !== null) return null
    if (pub.phase === 'wait' || pub.phase === 'done' || pub.phase === 'between') return null
    if (pub.pending) {
      for (let s = 0; s < seats; s++) {
        const legal = pub.legal[s] || []
        if (legal.includes('quiero') || legal.includes('no')) return s
      }
      return null
    }
    if (pub.phase === 'play') return pub.turn
    return null
  }

  function refreshHud() {
    const pub = lastPub
    const handEl = document.getElementById('hudHand')
    const turnEl = document.getElementById('hudTurn')
    const scoreEl = document.getElementById('hudScore')
    const banner = document.getElementById('turnBanner')
    const hint = document.getElementById('actionHint')
    const usEl = document.getElementById('scoreUs')
    const themEl = document.getElementById('scoreThem')
    const usCap = document.getElementById('scoreUsCap')
    const themCap = document.getElementById('scoreThemCap')
    if (handEl) {
      handEl.textContent = mySeat < 0 ? t('spectating') : myHand.map(cardLabel).join(' ') || '—'
    }
    const actor = actorSeat(pub)
    let turnText = '—'
    if (!pub) turnText = '—'
    else if (pub.winnerTeam !== null) turnText = t('matchOver', { team: pub.winnerTeam })
    else if (pub.phase === 'wait') turnText = t('waitingHud', { filled: pub.seatsFilled, seats: pub.seatCount || seats })
    else if (pub.pending) {
      const chant = chantLabel(pub.pending.ladder[pub.pending.ladder.length - 1] || pub.lastChant)
      turnText = actor === mySeat ? t('youAnswer', { chant }) : actor !== null ? t('pAnswers', { chant, n: actor }) : chant
    } else if (actor === mySeat) turnText = t('yourTurn')
    else if (actor !== null) turnText = t('pPlays', { n: actor })
    if (turnEl) turnEl.textContent = turnText
    if (banner) banner.textContent = turnText

    const cap = pub ? pub.target || target : target
    const origin = mySeat < 0 ? 0 : mySeat
    const us = teamOf(origin, seats)
    const them = (us + 1) % TEAM_COUNT
    const usScore = pub ? pub.scores[us] ?? 0 : 0
    const themScore = pub ? pub.scores[them] ?? 0 : 0
    if (scoreEl) {
      if (!pub) scoreEl.textContent = '—'
      else if (mySeat < 0) scoreEl.textContent = `${pub.scores[0] ?? 0}/${cap}–${pub.scores[1] ?? 0}/${cap}`
      else scoreEl.textContent = `${t('us')} ${usScore}/${cap}  ${t('them')} ${themScore}/${cap}`
    }
    if (usEl) usEl.textContent = String(usScore)
    if (themEl) themEl.textContent = String(themScore)
    if (usCap) usCap.textContent = `/${cap}`
    if (themCap) themCap.textContent = `/${cap}`

    const legal = localLegal()
    for (const { name, id } of BTN_IDS) {
      const el = document.getElementById(id) as HTMLButtonElement | null
      if (!el) continue
      el.disabled = !legal.includes(name)
    }
    if (hint) {
      if (legal.includes('quiero') || legal.includes('no')) hint.textContent = t('answerChant')
      else if (legal.includes('play')) hint.textContent = t('clickCard')
      else if (legal.length > 0) hint.textContent = t('yourChants')
      else if (actor !== null && actor !== mySeat) hint.textContent = t('waitingOn', { n: actor })
      else hint.textContent = ''
    }
  }

  let tableSync: (pub: Pub | null) => void = () => {}

  function refreshUi() {
    refreshHud()
    tableSync(lastPub)
  }

  onLocale(refreshHud)

  for (const { name, id } of BTN_IDS) {
    const el = document.getElementById(id)
    if (!el) continue
    el.addEventListener('click', () => {
      if (name === 'quiero') submitAct({ t: 'quiero' })
      else if (name === 'no') submitAct({ t: 'no' })
      else if (name !== 'play') submitAct({ t: 'chant', name })
    })
  }

  function visOf(seat: number): number {
    const origin = mySeat < 0 ? 0 : mySeat
    const rel = (seat - origin + seats) % seats
    if (seats === 2) return rel === 0 ? 0 : 2
    return rel
  }

  function seatAnchor(vis: number): { x: number; y: number } {
    if (vis === 0) return { x: WIDTH / 2, y: HEIGHT - 58 }
    if (vis === 1) return { x: 86, y: HEIGHT / 2 }
    if (vis === 2) return { x: WIDTH / 2, y: 64 }
    return { x: WIDTH - 86, y: HEIGHT / 2 }
  }

  const table = installTable(k, {
    visOf,
    seatAnchor,
    getSeats: () => seats,
    getSeat: () => mySeat,
    getHand: () => myHand,
    localLegal,
    submitPlay: (i) => submitAct({ t: 'play', i }),
    cardLabel,
    hexColor,
  })
  tableSync = table.sync

  k.onDraw(() => {
    const pub = lastPub
    if (pub) {
      let banner = pub.log
      if (pub.winnerTeam !== null) banner = t('teamWins', { team: pub.winnerTeam })
      else if (pub.pending) {
        banner = `${chantLabel(pub.pending.ladder[pub.pending.ladder.length - 1] || '')}  want ${pub.pending.want} / no ${pub.pending.no}`
      }
      k.drawText({
        text: banner,
        pos: k.vec2(WIDTH / 2, 88),
        size: 14,
        color: hexColor('#f2b84b'),
        anchor: 'center',
      })
    }

    for (let seat = 0; seat < seats; seat++) {
      const vis = visOf(seat)
      const a = seatAnchor(vis)
      const you = seat === mySeat
      const actor = actorSeat(pub)
      const legalHere = pub ? pub.legal[seat] || [] : []
      const isActor = pub && pub.pending
        ? legalHere.includes('quiero') || legalHere.includes('no')
        : actor === seat
      const tag = you ? `${t('you')} P${seat}` : `P${seat}`
      const tagY = vis === 0 ? a.y + 8 : a.y - 46
      if (isActor) {
        k.drawRect({
          pos: k.vec2(a.x - 52, tagY - 28),
          width: 104,
          height: 22,
          radius: 6,
          color: hexColor('#8a1c28'),
          outline: { width: 2, color: hexColor('#e0b84a') },
        })
        k.drawText({
          text: pub && pub.pending ? t('answers') : t('plays'),
          pos: k.vec2(a.x, tagY - 17),
          size: 12,
          color: hexColor('#f2d48a'),
          anchor: 'center',
        })
      }
      k.drawText({
        text: tag + (pub && seat === pub.dealer ? ' · pie' : '') + (pub && seat === pub.mano ? ' · mano' : ''),
        pos: k.vec2(a.x, tagY),
        size: isActor ? 16 : 12,
        color: hexColor(isActor ? '#f2d48a' : you ? HOST_COLOR : '#d7dbe6'),
        anchor: 'center',
      })
    }

    if (pub) {
      const tw = pub.trickWins.map((x) => (x === 'parda' ? 'P' : `T${x}`)).join(' ')
      k.drawText({
        text: tw ? `tricks ${tw}   hand ${pub.handPoints}pt` : `hand ${pub.handPoints}pt`,
        pos: k.vec2(WIDTH / 2, HEIGHT - 18),
        size: 12,
        color: hexColor('#c5cbd6'),
        anchor: 'center',
      })
    }
  })
}
