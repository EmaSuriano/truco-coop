export type Suit = 'espada' | 'basto' | 'oro' | 'copa'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12
export type Card = { suit: Suit; rank: Rank }

export type EnvidoResult = { points: number; cards: Card[] }

export const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa']
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank })
  }
  return deck
}

/** Host-only Fisher–Yates. Joiners must never shuffle or deal. */
export function shuffle<T>(cards: T[]): T[] {
  const a = cards.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

/** Deterministic PRNG. Used only by shuffleWithSeed. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seeded Fisher–Yates. Same cards + same seed => same order. Reducer DEAL uses this. */
export function shuffleWithSeed<T>(cards: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const a = cards.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

/** Higher number wins the trick. */
export function trucoRank(card: Card): number {
  const { suit, rank } = card
  if (rank === 1 && suit === 'espada') return 14
  if (rank === 1 && suit === 'basto') return 13
  if (rank === 7 && suit === 'espada') return 12
  if (rank === 7 && suit === 'oro') return 11
  if (rank === 3) return 10
  if (rank === 2) return 9
  if (rank === 1) return 8
  if (rank === 12) return 7
  if (rank === 11) return 6
  if (rank === 10) return 5
  if (rank === 7) return 4
  if (rank === 6) return 3
  if (rank === 5) return 2
  return 1
}

export function envidoPips(card: Card): number {
  return card.rank >= 10 ? 0 : card.rank
}

export function envidoOf(hand: Card[]): EnvidoResult {
  const bySuit = new Map<Suit, Card[]>()
  for (const card of hand) {
    const list = bySuit.get(card.suit) || []
    list.push(card)
    bySuit.set(card.suit, list)
  }

  let best: EnvidoResult | null = null

  for (const group of bySuit.values()) {
    if (group.length < 2) continue
    const sorted = group.slice().sort((a, b) => envidoPips(b) - envidoPips(a))
    const a = sorted[0]!
    const b = sorted[1]!
    const points = 20 + envidoPips(a) + envidoPips(b)
    if (!best || points > best.points) best = { points, cards: [a, b] }
  }

  if (best) return best

  let top = hand[0]
  let topPips = top ? envidoPips(top) : 0
  for (let i = 1; i < hand.length; i++) {
    const card = hand[i]!
    const p = envidoPips(card)
    if (p > topPips) {
      top = card
      topPips = p
    }
  }
  return { points: top ? topPips : 0, cards: top ? [top] : [] }
}

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank
}
