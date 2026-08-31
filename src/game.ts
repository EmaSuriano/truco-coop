import type { Room } from '@trystero-p2p/mqtt'
import { createStore } from 'zustand/vanilla'
import { MAX_SEATS } from './config'
import type { Card } from './deck'
import {
  type ChantName,
  type GameAction,
  type GameState,
  type Pub,
  type ViewState,
  buildPub,
  createGameState,
  reducer,
  seatsFilled,
  anyDisconnected,
} from './reducer'

export type { ActName, ChantName, GameAction, GameState, Pending, Pub, ViewState } from './reducer'
export { actorSeat, buildPub, cardLabel, chantLabel, CHANT_LABEL, createGameState, reducer } from './reducer'

export type ActMsg =
  | { t: 'play'; i: number }
  | { t: 'chant'; name: ChantName }
  | { t: 'quiero' }
  | { t: 'no' }

type HelloMsg = { seat: number; token: string }
type ClaimMsg = { token: string }
type HandMsg = { cards: Card[] }

const CLAIM_PREFIX = 'truco-coop-claim:'
const CLAIM_WAIT_MS = 400

function randomToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function claimKey(roomCode: string): string {
  return CLAIM_PREFIX + roomCode
}

function loadClaim(roomCode: string): { seat: number; token: string } | null {
  if (!roomCode) return null
  try {
    const raw = sessionStorage.getItem(claimKey(roomCode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { seat?: unknown; token?: unknown }
    if (typeof parsed.seat === 'number' && typeof parsed.token === 'string') {
      return { seat: parsed.seat, token: parsed.token }
    }
  } catch {
    /* ignore */
  }
  return null
}

function saveClaim(roomCode: string, seat: number, token: string) {
  if (!roomCode) return
  try {
    sessionStorage.setItem(claimKey(roomCode), JSON.stringify({ seat, token }))
  } catch {
    /* ignore */
  }
}

type StoreState = ViewState & { game: GameState }

export type GameStore = {
  subscribe(fn: () => void): () => void
  getState(): ViewState
  dispatch(act: ActMsg): void
  destroy(): void
}

export function actToGameAction(act: ActMsg, seat: number): GameAction {
  if (act.t === 'play') return { type: 'PLAY_CARD', seat, index: act.i }
  if (act.t === 'quiero') return { type: 'QUIERO', seat }
  if (act.t === 'no') return { type: 'NO_QUIERO', seat }
  switch (act.name) {
    case 'envido':
      return { type: 'CALL_ENVIDO', seat }
    case 'real':
      return { type: 'CALL_REAL', seat }
    case 'falta':
      return { type: 'CALL_FALTA', seat }
    case 'truco':
      return { type: 'CALL_TRUCO', seat }
    case 'retruco':
      return { type: 'CALL_RETRUCO', seat }
    case 'vale':
      return { type: 'CALL_VALE', seat }
  }
}

function viewFrom(game: GameState, lastPub: Pub | null): StoreState {
  const pub = game.isHost ? buildPub(game) : lastPub
  const mySeat = game.mySeat
  const myHand = mySeat >= 0 ? (game.hands[mySeat] || []).slice() : []
  return {
    game,
    mySeat,
    myHand,
    lastPub: pub,
    peerCount: game.peerCount,
    isHost: game.isHost,
    hostGone: game.hostGone,
  }
}

function randomSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0]!
}

export function startGame(
  room: Room,
  opts: { isHost: boolean; tableSize?: 2 | 4; targetScore?: 15 | 30; roomCode?: string },
): GameStore {
  const { isHost } = opts
  const roomCode = opts.roomCode || ''

  function publicUrl(path: string): string {
    const base = import.meta.env.BASE_URL || '/'
    return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`
  }

  const sounds = new Map<string, HTMLAudioElement>()
  const soundOk = new Set<string>()
  let bgmStarted = false
  let seenSfxN = 0

  function playSfx(name: string) {
    if (!name || name === 'bgm' || !soundOk.has(name)) return
    const src = sounds.get(name)
    if (!src) return
    try {
      const a = src.cloneNode(true) as HTMLAudioElement
      a.volume = 0.7
      void a.play().catch(() => {})
    } catch {
      /* mute-safe */
    }
  }

  function startBgm() {
    if (bgmStarted || !soundOk.has('bgm')) return
    bgmStarted = true
    const a = sounds.get('bgm')
    if (!a) {
      bgmStarted = false
      return
    }
    try {
      const p = a.play()
      if (p && typeof p.catch === 'function') p.catch(() => { bgmStarted = false })
    } catch {
      bgmStarted = false
    }
  }

  function loadAudio() {
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
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = name === 'bgm' ? 0.18 : 0.7
      if (name === 'bgm') audio.loop = true
      const markOk = () => {
        if (soundOk.has(name)) return
        soundOk.add(name)
        if (name === 'bgm') startBgm()
      }
      audio.addEventListener('canplaythrough', markOk)
      audio.addEventListener('error', () => { /* 404 must not throw */ })
      sounds.set(name, audio)
      void fetch(url)
        .then((res) => {
          if (!res.ok) return
          markOk()
        })
        .catch(() => {})
    }
  }

  const helloAction = room.makeAction<HelloMsg>('hello')
  const handAction = room.makeAction<HandMsg>('hand')
  const pubAction = room.makeAction<Pub>('pub')
  const actAction = room.makeAction<ActMsg>('act')
  const cfgAction = room.makeAction<{ n: 2 | 4; target: 15 | 30 }>('cfg')
  const claimAction = room.makeAction<ClaimMsg>('claim')

  const peerOfSeat: (string | null)[] = Array.from({ length: MAX_SEATS }, () => null)
  const seatOfPeer = new Map<string, number>()
  const seatToken: (string | null)[] = Array.from({ length: MAX_SEATS }, () => null)
  const pendingJoin = new Map<string, number>()
  const peers = new Set<string>()
  let hostPeerId: string | null = null
  let pendingNextDeal = false

  const store = createStore<StoreState>(() => viewFrom(createGameState(opts), null))

  function dispatchGame(action: GameAction) {
    const prev = store.getState().game
    store.setState((s) => {
      const game = reducer(s.game, action)
      const lastPub = action.type === 'APPLY_PUB' ? action.pub : game.isHost ? buildPub(game) : s.lastPub
      return viewFrom(game, lastPub)
    })
    const next = store.getState()

    if (!isHost) {
      if (action.type === 'APPLY_PUB') {
        const pub = action.pub
        if (pub.sfx && pub.sfxN && pub.sfxN !== seenSfxN) {
          seenSfxN = pub.sfxN
          playSfx(pub.sfx)
        }
      }
      return
    }

    if (next.game.sfxN !== prev.sfxN) playSfx(next.game.sfx)
    if (action.type !== 'START_HAND' && next.lastPub) {
      void pubAction.send(next.lastPub)
    }
    if (action.type === 'DEAL' && next.game.dealGen !== prev.dealGen) {
      for (let s = 1; s < next.game.seats; s++) sendHandTo(s)
    }
    if (next.game.phase === 'between' && next.game.winnerTeam === null) {
      scheduleNextHand(next.game.dealGen)
    }
  }

  function sendHandTo(seat: number) {
    if (!isHost) return
    if (seat === 0) return
    const peerId = peerOfSeat[seat]
    if (!peerId) return
    const cards = (store.getState().game.hands[seat] || []).map((c) => ({ suit: c.suit, rank: c.rank }))
    void handAction.send({ cards }, { target: peerId })
  }

  function scheduleNextHand(gen: number) {
    if (!isHost) return
    window.setTimeout(() => {
      const g = store.getState().game
      if (g.dealGen !== gen || g.winnerTeam !== null) return
      if (anyDisconnected(g)) {
        pendingNextDeal = true
        return
      }
      dispatchGame({ type: 'START_HAND' })
      dispatchGame({ type: 'DEAL', seed: randomSeed() })
    }, 2800)
  }

  function maybeResumeDeal() {
    if (!isHost || !pendingNextDeal) return
    const g = store.getState().game
    if (anyDisconnected(g) || g.winnerTeam !== null) return
    pendingNextDeal = false
    if (g.phase !== 'between') return
    dispatchGame({ type: 'START_HAND' })
    dispatchGame({ type: 'DEAL', seed: randomSeed() })
  }

  function dealFresh() {
    const g = store.getState().game
    if (anyDisconnected(g)) return
    dispatchGame({ type: 'START_HAND' })
    dispatchGame({ type: 'DEAL', seed: randomSeed() })
  }

  function submitAct(act: ActMsg) {
    const { mySeat } = store.getState()
    if (mySeat < 0) return
    if (isHost) {
      dispatchGame(actToGameAction(act, mySeat))
      return
    }
    void actAction.send(act)
    if (act.t === 'play') {
      const hand = store.getState().myHand
      if (act.i >= 0 && act.i < hand.length) {
        const cards = hand.filter((_, i) => i !== act.i)
        dispatchGame({ type: 'SET_HAND', cards })
      }
    }
  }

  function assignSeat(peerId: string): number | null {
    const g = store.getState().game
    for (let s = 1; s < g.seats; s++) {
      if (peerOfSeat[s] || seatToken[s] || g.occupied[s]) continue
      peerOfSeat[s] = peerId
      seatOfPeer.set(peerId, s)
      seatToken[s] = randomToken()
      return s
    }
    return null
  }

  function clearJoinTimer(peerId: string) {
    const t = pendingJoin.get(peerId)
    if (t !== undefined) {
      window.clearTimeout(t)
      pendingJoin.delete(peerId)
    }
  }

  function sendSeatState(peerId: string, seat: number) {
    const g = store.getState().game
    void cfgAction.send({ n: g.seats, target: g.target }, { target: peerId })
    void helloAction.send({ seat, token: seatToken[seat] || '' }, { target: peerId })
    if (g.hands[seat] && g.hands[seat]!.length > 0) sendHandTo(seat)
  }

  function afterBind(seat: number) {
    const after = store.getState().game
    if (after.hands[seat] && after.hands[seat]!.length > 0) sendHandTo(seat)
    if (seatsFilled(after) >= after.seats && after.phase === 'wait' && !anyDisconnected(after)) {
      dealFresh()
    }
    maybeResumeDeal()
  }

  function assignNewOrSpectate(peerId: string) {
    if (seatOfPeer.has(peerId)) return
    const assigned = assignSeat(peerId)
    if (assigned === null) {
      const g = store.getState().game
      void cfgAction.send({ n: g.seats, target: g.target }, { target: peerId })
      dispatchGame({ type: 'PEER_JOIN', seat: null })
      return
    }
    sendSeatState(peerId, assigned)
    dispatchGame({ type: 'PEER_JOIN', seat: assigned })
    afterBind(assigned)
  }

  function reclaimSeat(peerId: string, seat: number) {
    const prev = peerOfSeat[seat]
    if (prev && prev !== peerId) seatOfPeer.delete(prev)
    const cur = seatOfPeer.get(peerId)
    if (cur !== undefined && cur !== seat) {
      peerOfSeat[cur] = null
      seatToken[cur] = null
      seatOfPeer.delete(peerId)
    }
    peerOfSeat[seat] = peerId
    seatOfPeer.set(peerId, seat)
    sendSeatState(peerId, seat)
    dispatchGame({ type: 'PEER_JOIN', seat })
    afterBind(seat)
  }

  function greetPeer(peerId: string) {
    const isNew = !peers.has(peerId)
    peers.add(peerId)
    if (!isHost) {
      if (isNew) dispatchGame({ type: 'PEER_JOIN', seat: null })
      return
    }
    if (seatOfPeer.has(peerId)) return
    clearJoinTimer(peerId)
    const t = window.setTimeout(() => {
      pendingJoin.delete(peerId)
      if (seatOfPeer.has(peerId)) return
      assignNewOrSpectate(peerId)
    }, CLAIM_WAIT_MS)
    pendingJoin.set(peerId, t)
  }

  room.onPeerJoin = (peerId) => {
    greetPeer(peerId)
  }

  room.onPeerLeave = (peerId) => {
    if (!peers.delete(peerId)) return
    clearJoinTimer(peerId)
    if (!isHost) {
      if (hostPeerId && peerId === hostPeerId) dispatchGame({ type: 'HOST_GONE' })
      else dispatchGame({ type: 'PEER_LEAVE', seat: null })
      return
    }
    const seat = seatOfPeer.get(peerId)
    if (seat !== undefined) {
      peerOfSeat[seat] = null
      seatOfPeer.delete(peerId)
      dispatchGame({ type: 'PEER_LEAVE', seat })
    } else {
      dispatchGame({ type: 'PEER_LEAVE', seat: null })
    }
  }

  claimAction.onMessage = (data, context) => {
    if (!isHost || !data) return
    const peerId = context.peerId
    peers.add(peerId)
    clearJoinTimer(peerId)
    const token = typeof data.token === 'string' ? data.token : ''
    let found: number | null = null
    if (token) {
      for (let s = 1; s < MAX_SEATS; s++) {
        if (seatToken[s] && seatToken[s] === token) {
          found = s
          break
        }
      }
    }
    if (found === null) {
      assignNewOrSpectate(peerId)
      return
    }
    reclaimSeat(peerId, found)
  }

  cfgAction.onMessage = (data, context) => {
    if (isHost || !data) return
    if (context?.peerId) hostPeerId = context.peerId
    const seats = data.n === 2 || data.n === 4 ? data.n : undefined
    const target = data.target === 15 || data.target === 30 ? data.target : undefined
    if (seats !== undefined || target !== undefined) {
      dispatchGame({ type: 'SET_CFG', seats, target })
    }
  }

  helloAction.onMessage = (data, context) => {
    if (isHost) return
    if (context?.peerId) hostPeerId = context.peerId
    if (data && typeof data.seat === 'number') {
      dispatchGame({ type: 'SET_SEAT', seat: data.seat })
      const token = typeof data.token === 'string' ? data.token : ''
      saveClaim(roomCode, data.seat, token)
    }
  }

  handAction.onMessage = (data) => {
    if (isHost) return
    if (data && Array.isArray(data.cards)) {
      dispatchGame({ type: 'SET_HAND', cards: data.cards })
    }
  }

  pubAction.onMessage = (data) => {
    if (isHost) return
    if (data) dispatchGame({ type: 'APPLY_PUB', pub: data })
  }

  actAction.onMessage = (data, context) => {
    if (!isHost || !data) return
    const seat = seatOfPeer.get(context.peerId)
    if (seat === undefined) return
    dispatchGame(actToGameAction(data, seat))
  }

  loadAudio()

  if (typeof room.getPeers === 'function') {
    const existing = room.getPeers() || {}
    const ids = Array.isArray(existing) ? existing : Object.keys(existing)
    for (const peerId of ids) greetPeer(peerId)
  }

  if (!isHost) {
    const claim = loadClaim(roomCode)
    if (claim && claim.token) void claimAction.send({ token: claim.token })
  }

  return {
    subscribe(fn: () => void) {
      return store.subscribe(fn)
    },
    getState() {
      return store.getState()
    },
    dispatch(act: ActMsg) {
      submitAct(act)
    },
    destroy() {
      for (const t of pendingJoin.values()) window.clearTimeout(t)
      pendingJoin.clear()
      const bgm = sounds.get('bgm')
      if (bgm) {
        try {
          bgm.pause()
          bgm.src = ''
        } catch {
          /* mute-safe */
        }
      }
    },
  }
}
