export type Locale = 'es' | 'en'

const STORAGE_KEY = 'truco-coop-locale'

export type Dict = {
  sub: string
  players: string
  playTo: string
  size2: string
  size4: string
  createRoom: string
  shareLink: string
  copy: string
  copied: string
  waiting: string
  roomOpen: string
  wait1: string
  wait3: string
  joining: string
  you: string
  cards: string
  turn: string
  score: string
  peers: string
  connected: string
  spectating: string
  matchOver: string
  waitingHud: string
  yourTurn: string
  pPlays: string
  youAnswer: string
  pAnswers: string
  us: string
  them: string
  plays: string
  answers: string
  answerChant: string
  clickCard: string
  yourChants: string
  waitingOn: string
  teamWins: string
  fileHint: string
  disconnected: string
  waitingReconnect: string
  hostLeft: string
  backToLobby: string
  seatOffline: string
}

const es: Dict = {
  sub: 'Truco argentino. El host elige tamano de mesa y chico, y comparte el enlace.',
  players: 'Jugadores',
  playTo: 'A tantos',
  size2: '2 - 1v1',
  size4: '4 - 2v2',
  createRoom: 'Crear sala',
  shareLink: 'Comparti este enlace',
  copy: 'Copiar',
  copied: 'Copiado',
  waiting: 'Esperando...',
  roomOpen: 'Sala abierta',
  wait1: 'Sala creada. Esperando 1 mas...',
  wait3: 'Sala creada. Esperando 3 mas...',
  joining: 'Entrando a la sala {room}...',
  you: 'VOS',
  cards: 'cartas',
  turn: 'turno',
  score: 'tanto',
  peers: 'PARES',
  connected: 'conectados',
  spectating: 'espectando',
  matchOver: 'fin del partido (equipo {team})',
  waitingHud: 'esperando {filled}/{seats}',
  yourTurn: 'tu turno',
  pPlays: 'P{n} juega',
  youAnswer: '{chant} - respondes vos',
  pAnswers: '{chant} - P{n} responde',
  us: 'NOS',
  them: 'ELLOS',
  plays: 'JUEGA',
  answers: 'RESPONDE',
  answerChant: 'Responde el canto',
  clickCard: 'Toca una carta, o canta',
  yourChants: 'Tus cantos',
  waitingOn: 'Esperando a P{n}',
  teamWins: 'Gana el equipo {team}',
  fileHint: 'Usar el servidor de desarrollo, no un archivo.',
  disconnected: 'desconectado',
  waitingReconnect: 'Esperando que P{n} vuelva a unirse',
  hostLeft: 'El anfitrion se fue. La mesa se cerro.',
  backToLobby: 'Volver al lobby',
  seatOffline: 'offline',
}

const en: Dict = {
  sub: 'Argentine Truco. Host picks table size and chico, then share the link.',
  players: 'Players',
  playTo: 'Play to',
  size2: '2 - 1v1',
  size4: '4 - 2v2',
  createRoom: 'Create Room',
  shareLink: 'Share this link',
  copy: 'Copy',
  copied: 'Copied',
  waiting: 'Waiting...',
  roomOpen: 'Room open',
  wait1: 'Room created. Waiting for 1 more...',
  wait3: 'Room created. Waiting for 3 more...',
  joining: 'Joining room {room}...',
  you: 'YOU',
  cards: 'cards',
  turn: 'turn',
  score: 'score',
  peers: 'PEERS',
  connected: 'connected',
  spectating: 'spectating',
  matchOver: 'match over (team {team})',
  waitingHud: 'waiting {filled}/{seats}',
  yourTurn: 'your turn',
  pPlays: 'P{n} plays',
  youAnswer: '{chant} - you answer',
  pAnswers: '{chant} - P{n} answers',
  us: 'US',
  them: 'THEM',
  plays: 'PLAYS',
  answers: 'ANSWERS',
  answerChant: 'Answer the chant',
  clickCard: 'Click a card, or chant',
  yourChants: 'Your chants',
  waitingOn: 'Waiting on P{n}',
  teamWins: 'Team {team} wins the match',
  fileHint: 'Open this with the dev server, not as a file.',
  disconnected: 'disconnected',
  waitingReconnect: 'Waiting for P{n} to rejoin',
  hostLeft: 'The host left. This table is closed.',
  backToLobby: 'Back to lobby',
  seatOffline: 'offline',
}

const dicts: Record<Locale, Dict> = { es, en }
let locale: Locale = 'es'
const listeners: Array<() => void> = []

function readStored(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'es') return v
  } catch {
    /* ignore */
  }
  return 'es'
}

export function getLocale(): Locale {
  return locale
}

export function t(key: keyof Dict, vars?: Record<string, string | number>): string {
  let s = dicts[locale][key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v))
  }
  return s
}

export function applyChrome() {
  document.documentElement.lang = locale
}

export function setLocale(next: Locale) {
  locale = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  applyChrome()
  for (const fn of listeners) fn()
}

export function onLocale(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

export function initI18n() {
  locale = readStored()
  applyChrome()
}
