import { MAX_SEATS, TEAM_COUNT, MALAS, teamOf, nextSeat } from './config'
import { type Card, makeDeck, shuffleWithSeed, trucoRank, envidoOf } from './deck'

export type ChantName = 'envido' | 'real' | 'falta' | 'truco' | 'retruco' | 'vale'
export type ActName = ChantName | 'play' | 'quiero' | 'no'
export type Phase = 'wait' | 'play' | 'pending' | 'between' | 'done'
export type TrickMark = number | 'parda'

export type Pending = {
  kind: 'envido' | 'truco'
  fromSeat: number
  want: number
  no: number
  ladder: string[]
}

export type TrickPlay = { seat: number; card: Card }

export type Reveal = { seat: number; cards: Card[] }

export type Pub = {
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

export type ViewState = {
  mySeat: number
  myHand: Card[]
  lastPub: Pub | null
  peerCount: number
  isHost: boolean
}

export type GameState = {
  isHost: boolean
  seats: 2 | 4
  target: 15 | 30
  occupied: boolean[]
  mySeat: number
  peerCount: number
  scores: number[]
  dealer: number
  mano: number
  turn: number
  phase: Phase
  trick: TrickPlay[]
  lastChant: string
  pending: Pending | null
  heldTruco: Pending | null
  trickWins: TrickMark[]
  log: string
  winnerTeam: number | null
  reveal: Reveal[]
  handPoints: number
  envidoDone: boolean
  playedCard: boolean[]
  trucoLadder: string[]
  trucoLastTeam: number
  dealGen: number
  hands: Card[][]
  sfx: string
  sfxN: number
}

export type GameAction =
  | { type: 'PLAY_CARD'; seat: number; index: number }
  | { type: 'CALL_ENVIDO'; seat: number }
  | { type: 'CALL_REAL'; seat: number }
  | { type: 'CALL_FALTA'; seat: number }
  | { type: 'CALL_TRUCO'; seat: number }
  | { type: 'CALL_RETRUCO'; seat: number }
  | { type: 'CALL_VALE'; seat: number }
  | { type: 'QUIERO'; seat: number }
  | { type: 'NO_QUIERO'; seat: number }
  | { type: 'DEAL'; seed?: number }
  | { type: 'START_HAND' }
  | { type: 'PEER_JOIN'; seat: number | null }
  | { type: 'PEER_LEAVE'; seat: number | null }
  | { type: 'SET_CFG'; seats?: 2 | 4; target?: 15 | 30 }
  | { type: 'SET_SEAT'; seat: number }
  | { type: 'APPLY_PUB'; pub: Pub }
  | { type: 'SET_HAND'; cards: Card[] }

const ENVIDO_NAMES: ChantName[] = ['envido', 'real', 'falta']
const TRUCO_NAMES: ChantName[] = ['truco', 'retruco', 'vale']

const SUIT_MARK: Record<Card['suit'], string> = {
  espada: 'E',
  basto: 'B',
  oro: 'O',
  copa: 'C',
}

export const CHANT_LABEL: Record<ChantName, string> = {
  envido: 'Envido',
  real: 'Real Envido',
  falta: 'Falta Envido',
  truco: 'Truco',
  retruco: 'Retruco',
  vale: 'Vale cuatro',
}

const CHANT_BY_ACTION: Record<
  'CALL_ENVIDO' | 'CALL_REAL' | 'CALL_FALTA' | 'CALL_TRUCO' | 'CALL_RETRUCO' | 'CALL_VALE',
  ChantName
> = {
  CALL_ENVIDO: 'envido',
  CALL_REAL: 'real',
  CALL_FALTA: 'falta',
  CALL_TRUCO: 'truco',
  CALL_RETRUCO: 'retruco',
  CALL_VALE: 'vale',
}

function emptyHands(): Card[][] {
  return Array.from({ length: MAX_SEATS }, () => [])
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0)
}

function cloneCard(card: Card): Card {
  return { suit: card.suit, rank: card.rank }
}

function clonePending(pending: Pending | null): Pending | null {
  if (!pending) return null
  return {
    kind: pending.kind,
    fromSeat: pending.fromSeat,
    want: pending.want,
    no: pending.no,
    ladder: pending.ladder.slice(),
  }
}

function withSfx(state: GameState, name: string): GameState {
  return { ...state, sfx: name, sfxN: state.sfxN + 1 }
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

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_MARK[card.suit]}`
}

export function chantLabel(name: string): string {
  return CHANT_LABEL[name as ChantName] || name
}

export function actorSeat(pub: Pub | null): number | null {
  if (!pub || pub.winnerTeam !== null) return null
  if (pub.phase === 'wait' || pub.phase === 'done' || pub.phase === 'between') return null
  if (pub.pending) {
    const n = pub.seatCount || pub.legal.length
    for (let s = 0; s < n; s++) {
      const legal = pub.legal[s] || []
      if (legal.includes('quiero') || legal.includes('no')) return s
    }
    return null
  }
  if (pub.phase === 'play') return pub.turn
  return null
}

export function seatsFilled(state: GameState): number {
  let n = 0
  for (let s = 0; s < state.seats; s++) if (state.occupied[s]) n += 1
  return n
}

function legalFor(state: GameState, seat: number): ActName[] {
  const out: ActName[] = []
  if (!state.isHost) return out
  if (state.winnerTeam !== null || state.phase === 'wait' || state.phase === 'between' || state.phase === 'done') {
    return out
  }
  if (seatsFilled(state) < state.seats) return out

  const myTeam = teamOf(seat, state.seats)
  const hasPlayed = state.playedCard[seat]
  const firstTrick = state.trickWins.length === 0
  const isTurn = state.turn === seat && state.pending === null
  const canEnvidoOpen = firstTrick && !hasPlayed && !state.envidoDone

  if (state.pending) {
    if (teamOf(state.pending.fromSeat, state.seats) !== myTeam) {
      out.push('quiero', 'no')
      if (state.pending.kind === 'envido') {
        for (const n of envidoRaises(state.pending.ladder)) out.push(n)
      } else {
        for (const n of trucoRaises(state.pending.ladder)) out.push(n)
      }
    }
    if (
      state.pending.kind === 'truco' &&
      canEnvidoOpen &&
      teamOf(state.pending.fromSeat, state.seats) !== myTeam
    ) {
      for (const n of ENVIDO_NAMES) {
        if (!out.includes(n)) out.push(n)
      }
    }
    return out
  }

  if (isTurn && state.hands[seat] && state.hands[seat]!.length > 0) out.push('play')
  if (isTurn && canEnvidoOpen) {
    for (const n of ENVIDO_NAMES) out.push(n)
  }
  if (isTurn) {
    if (state.trucoLadder.length === 0) out.push('truco')
    else if (state.trucoLastTeam !== myTeam) {
      for (const n of trucoRaises(state.trucoLadder)) out.push(n)
    }
  }
  return out
}

function allLegal(state: GameState): string[][] {
  return Array.from({ length: state.seats }, (_, s) => legalFor(state, s))
}

export function buildPub(state: GameState): Pub {
  return {
    scores: state.scores.slice(),
    dealer: state.dealer,
    mano: state.mano,
    turn: state.turn,
    phase: state.phase,
    trick: state.trick.map((p) => ({ seat: p.seat, card: cloneCard(p.card) })),
    cardsLeft: Array.from({ length: state.seats }, (_, s) => (state.hands[s] ? state.hands[s]!.length : 0)),
    lastChant: state.lastChant,
    pending: clonePending(state.pending),
    trickWins: state.trickWins.slice(),
    log: state.log,
    winnerTeam: state.winnerTeam,
    seatsFilled: seatsFilled(state),
    seatCount: state.seats,
    target: state.target,
    legal: allLegal(state),
    reveal:
      state.phase === 'between' || state.phase === 'done'
        ? state.reveal.map((r) => ({
            seat: r.seat,
            cards: r.cards.map(cloneCard),
          }))
        : [],
    handPoints: state.handPoints,
    sfx: state.sfx,
    sfxN: state.sfxN,
  }
}

export function createGameState(opts: {
  isHost: boolean
  tableSize?: 2 | 4
  targetScore?: 15 | 30
}): GameState {
  const seats: 2 | 4 = opts.tableSize === 4 ? 4 : 2
  const target: 15 | 30 = opts.targetScore === 30 ? 30 : 15
  const occupied = Array.from({ length: MAX_SEATS }, () => false)
  if (opts.isHost) occupied[0] = true
  return {
    isHost: opts.isHost,
    seats,
    target,
    occupied,
    mySeat: opts.isHost ? 0 : -1,
    peerCount: 0,
    scores: zeros(TEAM_COUNT),
    dealer: 0,
    mano: 1,
    turn: 1,
    phase: 'wait',
    trick: [],
    lastChant: '',
    pending: null,
    heldTruco: null,
    trickWins: [],
    log: `Waiting 1/${seats}`,
    winnerTeam: null,
    reveal: [],
    handPoints: 1,
    envidoDone: false,
    playedCard: Array.from({ length: MAX_SEATS }, () => false),
    trucoLadder: [],
    trucoLastTeam: -1,
    dealGen: 0,
    hands: emptyHands(),
    sfx: '',
    sfxN: 0,
  }
}

function resetHandVars(state: GameState): GameState {
  return {
    ...state,
    trick: [],
    lastChant: '',
    pending: null,
    heldTruco: null,
    trickWins: [],
    reveal: [],
    handPoints: 1,
    envidoDone: false,
    playedCard: Array.from({ length: MAX_SEATS }, () => false),
    trucoLadder: [],
    trucoLastTeam: -1,
  }
}

function endMatch(state: GameState, team: number): GameState {
  return withSfx(
    {
      ...state,
      winnerTeam: team,
      phase: 'done',
      pending: null,
      heldTruco: null,
      log: `Team ${team} wins the match (${state.scores[0]}–${state.scores[1]}).`,
    },
    'win-match',
  )
}

function award(state: GameState, team: number, pts: number, why: string): GameState {
  const scores = state.scores.slice()
  scores[team] = scores[team]! + pts
  const next = { ...state, scores, log: why }
  if (scores[team]! >= next.target) return endMatch(next, team)
  return next
}

function finishHand(state: GameState, team: number, pts: number, why: string): GameState {
  const awarded = award(
    {
      ...state,
      phase: 'between',
      pending: null,
      heldTruco: null,
    },
    team,
    pts,
    why,
  )
  if (awarded.winnerTeam !== null) return awarded
  return withSfx(awarded, 'win-hand')
}

function envidoBest(state: GameState): { seat: number; points: number; cards: Card[] } {
  let bestSeat = state.mano
  let bestPts = -1
  let bestCards: Card[] = []
  for (let i = 0; i < state.seats; i++) {
    const s = (state.mano + i) % state.seats
    const ev = envidoOf(state.hands[s] || [])
    if (ev.points > bestPts) {
      bestPts = ev.points
      bestSeat = s
      bestCards = ev.cards.map(cloneCard)
    }
  }
  return { seat: bestSeat, points: bestPts, cards: bestCards }
}

function resumeHeldTruco(state: GameState): GameState {
  if (state.heldTruco && state.winnerTeam === null) {
    return {
      ...state,
      pending: clonePending(state.heldTruco),
      heldTruco: null,
      phase: 'pending',
    }
  }
  return {
    ...state,
    pending: null,
    phase: state.winnerTeam === null ? 'play' : 'done',
  }
}

function handWinnerFromTricks(trickWins: TrickMark[], mano: number, seats: number): number | null {
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

function resolveTrick(state: GameState): GameState {
  if (!state.isHost) return state
  const teamBest: { rank: number; seat: number }[] = Array.from(
    { length: TEAM_COUNT },
    () => ({ rank: -1, seat: -1 }),
  )
  for (const p of state.trick) {
    const t = teamOf(p.seat, state.seats)
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
  const leader = state.trick[0]!.seat
  let trickWins: TrickMark[]
  let turn: number
  let log: string
  if (teamsAt.length !== 1) {
    trickWins = state.trickWins.concat('parda')
    turn = leader
    log = `Emparda on trick ${trickWins.length}.`
  } else {
    const t = teamsAt[0]!
    trickWins = state.trickWins.concat(t)
    turn = teamBest[t]!.seat
    log = `P${turn} wins trick ${trickWins.length}.`
  }
  const next: GameState = { ...state, trick: [], trickWins, turn, log }
  const hw = handWinnerFromTricks(trickWins, next.mano, next.seats)
  if (hw !== null) {
    return finishHand(next, hw, next.handPoints, `Team ${hw} wins the hand +${next.handPoints}.`)
  }
  return { ...next, phase: 'play' }
}

function applyPlay(state: GameState, seat: number, index: number): GameState {
  if (!state.isHost) return state
  if (!legalFor(state, seat).includes('play')) return state
  const hand = state.hands[seat]
  if (!hand || index < 0 || index >= hand.length) return state
  const card = hand[index]!
  const nextHand = hand.slice(0, index).concat(hand.slice(index + 1))
  const hands = state.hands.map((h, i) => (i === seat ? nextHand : h.slice()))
  const playedCard = state.playedCard.slice()
  playedCard[seat] = true
  const trick = state.trick.concat({ seat, card: cloneCard(card) })
  const next = withSfx(
    {
      ...state,
      hands,
      playedCard,
      trick,
      log: `P${seat} plays ${cardLabel(card)}.`,
    },
    'play',
  )
  if (trick.length >= state.seats) return resolveTrick(next)
  return {
    ...next,
    turn: nextSeat(state.turn, state.seats),
    phase: 'play',
  }
}

function applyChant(state: GameState, seat: number, name: ChantName): GameState {
  if (!state.isHost) return state
  if (!legalFor(state, seat).includes(name)) return state

  if (ENVIDO_NAMES.includes(name)) {
    let held = state.heldTruco
    let pending = state.pending
    if (pending && pending.kind === 'truco') {
      held = clonePending(pending)
      pending = null
    }
    const ladder = pending && pending.kind === 'envido' ? pending.ladder.concat(name) : [name]
    const nextPending: Pending = {
      kind: 'envido',
      fromSeat: seat,
      want: envidoWant(ladder, state.scores, teamOf(seat, state.seats), state.target),
      no: envidoNo(ladder, state.scores, teamOf(seat, state.seats), state.target),
      ladder,
    }
    return withSfx(
      {
        ...state,
        heldTruco: held,
        pending: nextPending,
        lastChant: name,
        phase: 'pending',
        log: `P${seat}: ${chantLabel(name)} (${nextPending.want}/${nextPending.no}).`,
      },
      'chant',
    )
  }

  if (!TRUCO_NAMES.includes(name)) return state
  let ladder: string[]
  if (state.pending && state.pending.kind === 'truco') ladder = state.pending.ladder.concat(name)
  else if (state.trucoLadder.length > 0) ladder = state.trucoLadder.concat(name)
  else ladder = [name]
  const nextPending: Pending = {
    kind: 'truco',
    fromSeat: seat,
    want: trucoWant(ladder),
    no: trucoNo(ladder),
    ladder,
  }
  return withSfx(
    {
      ...state,
      pending: nextPending,
      trucoLastTeam: teamOf(seat, state.seats),
      lastChant: name,
      phase: 'pending',
      log: `P${seat}: ${chantLabel(name)} (${nextPending.want}/${nextPending.no}).`,
    },
    'chant',
  )
}

function applyQuiero(state: GameState, seat: number): GameState {
  if (!state.isHost || !state.pending) return state
  if (!legalFor(state, seat).includes('quiero')) return state
  if (state.pending.kind === 'envido') {
    const want = state.pending.want
    const best = envidoBest(state)
    const team = teamOf(best.seat, state.seats)
    const cleared: GameState = {
      ...state,
      envidoDone: true,
      reveal: [{ seat: best.seat, cards: best.cards }],
      pending: null,
    }
    const awarded = award(
      withSfx(cleared, 'want'),
      team,
      want,
      `P${best.seat} wins envido (${best.points}) +${want}. Reveal at end of hand.`,
    )
    if (awarded.winnerTeam !== null) return awarded
    return resumeHeldTruco(awarded)
  }
  return withSfx(
    {
      ...state,
      handPoints: state.pending.want,
      trucoLadder: state.pending.ladder.slice(),
      trucoLastTeam: teamOf(state.pending.fromSeat, state.seats),
      pending: null,
      phase: 'play',
      log: `P${seat}: Quiero. Hand is worth ${state.pending.want}.`,
    },
    'want',
  )
}

function applyNo(state: GameState, seat: number): GameState {
  if (!state.isHost || !state.pending) return state
  if (!legalFor(state, seat).includes('no')) return state
  const from = state.pending.fromSeat
  const team = teamOf(from, state.seats)
  const pts = state.pending.no
  const kind = state.pending.kind
  const cleared = withSfx({ ...state, pending: null }, 'no')
  if (kind === 'envido') {
    const awarded = award(
      { ...cleared, envidoDone: true },
      team,
      pts,
      `P${seat}: No quiero. Team ${team} +${pts} (envido).`,
    )
    if (awarded.winnerTeam !== null) return awarded
    return resumeHeldTruco(awarded)
  }
  return finishHand(cleared, team, pts, `P${seat}: No quiero. Team ${team} +${pts} (truco).`)
}

function deal(state: GameState, seed?: number): GameState {
  if (!state.isHost) return state
  if (seatsFilled(state) < state.seats || state.winnerTeam !== null) return state
  const reset = resetHandVars(state)
  const hands = emptyHands()
  const deck = shuffleWithSeed(makeDeck(), seed ?? 0)
  let i = 0
  for (let r = 0; r < 3; r++) {
    for (let s = 0; s < reset.seats; s++) {
      const seat = (reset.mano + s) % reset.seats
      hands[seat] = hands[seat]!.concat(deck[i]!)
      i += 1
    }
  }
  return withSfx(
    {
      ...reset,
      hands,
      dealGen: reset.dealGen + 1,
      turn: reset.mano,
      phase: 'play',
      log: `Dealt. Mano P${reset.mano}. Dealer (pie) P${reset.dealer}.`,
    },
    'deal',
  )
}

function startHand(state: GameState): GameState {
  if (state.winnerTeam !== null) return state
  if (state.phase === 'wait') {
    const dealer = 0
    return { ...state, dealer, mano: nextSeat(dealer, state.seats) }
  }
  if (state.phase === 'between') {
    const dealer = nextSeat(state.dealer, state.seats)
    return { ...state, dealer, mano: nextSeat(dealer, state.seats) }
  }
  return state
}

function applyPeerJoin(state: GameState, seat: number | null): GameState {
  const occupied = state.occupied.slice()
  let log = state.log
  if (seat !== null && seat >= 0 && seat < MAX_SEATS) {
    occupied[seat] = true
    const filled = occupied.slice(0, state.seats).filter(Boolean).length
    log = `Waiting ${filled}/${state.seats}`
  } else {
    log = `Spectator joined (${state.peerCount + 1} peers). Table is full.`
  }
  return {
    ...state,
    occupied,
    peerCount: state.peerCount + 1,
    log,
  }
}

function applyPeerLeave(state: GameState, seat: number | null): GameState {
  const occupied = state.occupied.slice()
  let phase = state.phase
  let log = state.log
  if (seat !== null && seat >= 0 && seat < MAX_SEATS) {
    occupied[seat] = false
    log = `P${seat} left. Waiting to refill the table.`
    if (state.winnerTeam === null && phase !== 'wait' && phase !== 'done') {
      phase = 'wait'
    }
  }
  return {
    ...state,
    occupied,
    phase,
    log,
    peerCount: Math.max(0, state.peerCount - 1),
  }
}

function applyCfg(state: GameState, seats?: 2 | 4, target?: 15 | 30): GameState {
  return {
    ...state,
    seats: seats === 4 || seats === 2 ? seats : state.seats,
    target: target === 30 || target === 15 ? target : state.target,
  }
}

function applyPub(state: GameState, pub: Pub): GameState {
  if (state.isHost) return state
  const seats: 2 | 4 = pub.seatCount === 4 ? 4 : pub.seatCount === 2 ? 2 : state.seats
  const target: 15 | 30 = pub.target === 30 ? 30 : pub.target === 15 ? 15 : state.target
  const phase: Phase =
    pub.phase === 'wait' || pub.phase === 'play' || pub.phase === 'pending' || pub.phase === 'between' || pub.phase === 'done'
      ? pub.phase
      : state.phase
  return {
    ...state,
    seats,
    target,
    scores: pub.scores.slice(),
    dealer: pub.dealer,
    mano: pub.mano,
    turn: pub.turn,
    phase,
    trick: pub.trick.map((p) => ({ seat: p.seat, card: cloneCard(p.card) })),
    lastChant: pub.lastChant,
    pending: clonePending(pub.pending),
    trickWins: pub.trickWins.slice(),
    log: pub.log,
    winnerTeam: pub.winnerTeam,
    reveal: pub.reveal.map((r) => ({ seat: r.seat, cards: r.cards.map(cloneCard) })),
    handPoints: pub.handPoints,
    sfx: pub.sfx || state.sfx,
    sfxN: typeof pub.sfxN === 'number' ? pub.sfxN : state.sfxN,
  }
}

function applySetHand(state: GameState, cards: Card[]): GameState {
  if (state.mySeat < 0) return state
  const hands = state.hands.map((h) => h.slice())
  hands[state.mySeat] = cards.map(cloneCard)
  return { ...state, hands }
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLAY_CARD':
      return applyPlay(state, action.seat, action.index)
    case 'CALL_ENVIDO':
    case 'CALL_REAL':
    case 'CALL_FALTA':
    case 'CALL_TRUCO':
    case 'CALL_RETRUCO':
    case 'CALL_VALE':
      return applyChant(state, action.seat, CHANT_BY_ACTION[action.type])
    case 'QUIERO':
      return applyQuiero(state, action.seat)
    case 'NO_QUIERO':
      return applyNo(state, action.seat)
    case 'DEAL':
      return deal(state, action.seed)
    case 'START_HAND':
      return startHand(state)
    case 'PEER_JOIN':
      return applyPeerJoin(state, action.seat)
    case 'PEER_LEAVE':
      return applyPeerLeave(state, action.seat)
    case 'SET_CFG':
      return applyCfg(state, action.seats, action.target)
    case 'SET_SEAT':
      return { ...state, mySeat: action.seat }
    case 'APPLY_PUB':
      return applyPub(state, action.pub)
    case 'SET_HAND':
      return applySetHand(state, action.cards)
    default: {
      const _never: never = action
      return _never
    }
  }
}
