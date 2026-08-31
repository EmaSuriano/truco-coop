export const APP_ID = 'truco-coop'
export const WIDTH = 960
export const HEIGHT = 540
export const MAX_SEATS = 4
export const SEAT_COUNT = 4
export const TEAM_COUNT = 2
export const TARGET = 30
export const MALAS = 15
export const HOST_COLOR = '#6ee7a8'
export const JOIN_COLOR = '#f2b84b'

export type SeatCount = 2 | 4

export function teamOf(seat: number, seatCount: number = 4): number {
  if (seatCount === 2) return seat
  return seat % (seatCount / 2)
}

export function partnerOf(seat: number, seatCount: number = 4): number | null {
  if (seatCount === 2) return null
  return (seat + seatCount / 2) % seatCount
}

export function nextSeat(seat: number, seatCount: number = 4): number {
  return (seat + 1) % seatCount
}
