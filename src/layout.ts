import { WIDTH, HEIGHT } from './config'

export function visOf(seat: number, mySeat: number, seats: number): number {
  const origin = mySeat < 0 ? 0 : mySeat
  const rel = (seat - origin + seats) % seats
  if (seats === 2) return rel === 0 ? 0 : 2
  return rel
}

export function seatAnchor(vis: number): { x: number; y: number } {
  if (vis === 0) return { x: WIDTH / 2, y: HEIGHT - 58 }
  if (vis === 1) return { x: 86, y: HEIGHT / 2 }
  if (vis === 2) return { x: WIDTH / 2, y: 64 }
  return { x: WIDTH - 86, y: HEIGHT / 2 }
}
