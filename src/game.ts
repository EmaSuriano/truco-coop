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
} from './reducer'

export type { ActName, ChantName, GameAction, GameState, Pending, Pub, ViewState } from './reducer'
export { actorSeat, buildPub, cardLabel, chantLabel, CHANT_LABEL, createGameState, reducer } from './reducer'

export type ActMsg =
  | { t: 'play'; i: number }
  | { t: 'chant'; name: ChantName }
  | { t: 'quiero' }
  | { t: 'no' }

type HelloMsg = { seat: number }
type HandMsg = { cards: Card[] }

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
  }
}

function randomSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0]!
}

export function startGame(
  room: Room,
  opts: { isHost: boolean; tableSize?: 2 | 4; targetScore?: 15 | 30 },
): GameStore {
  const { isHost } = opts

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

  const peerOfSeat: (string | null)[] = Array.from({ length: MAX_SEATS }, () => null)
  const seatOfPeer = new Map<string, number>()
  const peers = new Set<string>()

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
      dispatchGame({ type: 'START_HAND' })
      dispatchGame({ type: 'DEAL', seed: randomSeed() })
    }, 2800)
  }

  function dealFresh() {
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
    const seats = store.getState().game.seats
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
    const isNew = !peers.has(peerId)
    peers.add(peerId)
    if (!isHost) {
      if (isNew) dispatchGame({ type: 'PEER_JOIN', seat: null })
      return
    }
    let seat = seatOfPeer.get(peerId)
    if (seat === undefined) {
      const assigned = assignSeat(peerId)
      const g = store.getState().game
      if (assigned === null) {
        void cfgAction.send({ n: g.seats, target: g.target }, { target: peerId })
        if (isNew) dispatchGame({ type: 'PEER_JOIN', seat: null })
        return
      }
      seat = assigned
    }
    const g = store.getState().game
    void cfgAction.send({ n: g.seats, target: g.target }, { target: peerId })
    void helloAction.send({ seat }, { target: peerId })
    if (isNew) dispatchGame({ type: 'PEER_JOIN', seat })
    const after = store.getState().game
    if (after.hands[seat] && after.hands[seat]!.length > 0) sendHandTo(seat)
    if (seatsFilled(after) >= after.seats && after.phase === 'wait') {
      dealFresh()
    }
  }

  room.onPeerJoin = (peerId) => {
    greetPeer(peerId)
  }

  room.onPeerLeave = (peerId) => {
    if (!peers.delete(peerId)) return
    if (!isHost) {
      dispatchGame({ type: 'PEER_LEAVE', seat: null })
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

  cfgAction.onMessage = (data) => {
    if (isHost || !data) return
    const seats = data.n === 2 || data.n === 4 ? data.n : undefined
    const target = data.target === 15 || data.target === 30 ? data.target : undefined
    if (seats !== undefined || target !== undefined) {
      dispatchGame({ type: 'SET_CFG', seats, target })
    }
  }

  helloAction.onMessage = (data) => {
    if (isHost) return
    if (data && typeof data.seat === 'number') {
      dispatchGame({ type: 'SET_SEAT', seat: data.seat })
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
