import { connectRoom, genCode, shareLink } from './net'
import { startGame } from './game'
import { initI18n, onLocale, t } from './i18n'

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`
}

function wireUiArt() {
  const title = document.getElementById('titleArt') as HTMLImageElement | null
  if (title) {
    title.addEventListener('load', () => title.classList.add('ok'))
    title.addEventListener('error', () => title.remove())
    title.src = publicUrl('ui/title-truco.png')
  }
  const corner = publicUrl('ui/frame-corner.png')
  for (const el of document.querySelectorAll<HTMLImageElement>('.frameCorner')) {
    el.src = corner
  }
  const flourish = document.querySelector<HTMLImageElement>('.chantFlourish')
  if (flourish) flourish.src = publicUrl('ui/button-ornament.png')
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Required element #${id} is missing`)
  return el as T
}

const params = new URLSearchParams(location.search)
const roomParam = params.get('room')
const isHost = !roomParam
let roomCode = roomParam

const overlay = required<HTMLElement>('overlay')
const hostBtn = required<HTMLButtonElement>('hostBtn')
const tableSizeRow = required<HTMLElement>('tableSizeRow')
const targetScoreRow = required<HTMLElement>('targetScoreRow')
const linkRow = required<HTMLElement>('linkRow')
const linkInput = required<HTMLInputElement>('linkInput')
const copyBtn = required<HTMLButtonElement>('copyBtn')
const statusEl = required<HTMLElement>('status')
const gameWrap = required<HTMLElement>('gameWrap')
const peerCountEl = required<HTMLElement>('peerCount')
const felt = required<HTMLElement>('felt')

function showError(msg: string) {
  overlay.style.display = 'flex'
  gameWrap.style.display = 'none'
  statusEl.classList.add('err')
  statusEl.textContent = msg
}

function readTableSize(): 2 | 4 {
  const el = document.querySelector('input[name="tableSize"]:checked') as HTMLInputElement | null
  return el && el.value === '4' ? 4 : 2
}

function readTargetScore(): 15 | 30 {
  const el = document.querySelector('input[name="targetScore"]:checked') as HTMLInputElement | null
  return el && el.value === '30' ? 30 : 15
}

function go(code: string) {
  const room = connectRoom(code, (details) => {
    showError(details.error)
  })
  overlay.style.display = 'none'
  gameWrap.style.display = 'flex'
  const tableSize = isHost ? readTableSize() : 2
  const targetScore = isHost ? readTargetScore() : 15
  startGame(room, { isHost, felt, peerCountEl, tableSize, targetScore })
}

copyBtn.addEventListener('click', () => {
  linkInput.select()
  void navigator.clipboard.writeText(linkInput.value)
  copyBtn.textContent = t('copied')
  setTimeout(() => {
    copyBtn.textContent = t('copy')
  }, 1200)
})

function onHostClick() {
  try {
    roomCode = genCode()
    const link = shareLink(roomCode)
    linkInput.value = link
    linkRow.classList.add('show')
    history.replaceState(null, '', link)
    statusEl.classList.remove('err')
    statusEl.textContent = readTableSize() === 2 ? t('wait1') : t('wait3')
    hostBtn.disabled = true
    hostBtn.textContent = t('roomOpen')
    go(roomCode)
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
  }
}

function refreshLobbyStatus() {
  if (hostBtn.disabled && isHost && roomCode) {
    hostBtn.textContent = t('roomOpen')
    statusEl.textContent = readTableSize() === 2 ? t('wait1') : t('wait3')
  } else if (roomParam) {
    statusEl.textContent = t('joining', { room: roomParam })
  } else if (!statusEl.classList.contains('err')) {
    statusEl.textContent = t('waiting')
  }
}


function boot() {
  if (!roomParam) {
    hostBtn.addEventListener('click', onHostClick)
    return
  }
  hostBtn.style.display = 'none'
  tableSizeRow.style.display = 'none'
  targetScoreRow.style.display = 'none'
  statusEl.textContent = t('joining', { room: roomParam })
  go(roomParam)
}

try {
  initI18n()
  onLocale(refreshLobbyStatus)
  wireUiArt()
  if (location.protocol === 'file:') {
    hostBtn.disabled = true
    showError(t('fileHint'))
  } else {
    boot()
  }
} catch (err) {
  showError(err instanceof Error ? err.message : String(err))
}
