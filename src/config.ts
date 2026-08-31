export const APP_ID = 'truco-coop'
export const WIDTH = 960
export const HEIGHT = 540
export const SEAT_COUNT = 4
export const TEAM_COUNT = 2
export const TARGET = 30
export const MALAS = 15
export const HOST_COLOR = '#6ee7a8'
export const JOIN_COLOR = '#f2b84b'

export function teamOf(seat: number): number {
  return seat % (SEAT_COUNT / 2)
}

export function partnerOf(seat: number): number {
  return (seat + SEAT_COUNT / 2) % SEAT_COUNT
}

export function nextSeat(seat: number): number {
  return (seat + 1) % SEAT_COUNT
}
