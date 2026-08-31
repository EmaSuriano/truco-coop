import { useCallback, useEffect, useState } from 'react'
import { startGame } from './game'
import type { GameStore } from './game'
import { connectRoom, genCode, shareLink } from './net'
import { useGame, useLocale } from './hooks'
import { t } from './i18n'
import { LangSwitch } from './components/LangSwitch'
import { Lobby } from './components/Lobby'
import { Hud } from './components/Hud'
import { ScoreBoard } from './components/ScoreBoard'
import { ChantBar } from './components/ChantBar'
import { Felt } from './components/Felt'

function backToLobby() {
  const url = new URL(location.href)
  url.searchParams.delete('room')
  location.href = url.pathname + url.search + url.hash
}

function HostGoneOverlay() {
  useLocale()
  return (
    <div id="overlay">
      <div id="card">
        <p className="sub">{t('hostLeft')}</p>
        <div className="row">
          <button className="primary" type="button" onClick={backToLobby}>
            {t('backToLobby')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Table({ store }: { store: GameStore }) {
  const view = useGame(store)
  return (
    <div id="gameWrap">
      <Hud view={view} />
      <ScoreBoard view={view} />
      <Felt view={view} onPlay={(i) => store.dispatch({ t: 'play', i })} />
      <ChantBar view={view} dispatch={(act) => store.dispatch(act)} />
      {view.hostGone && !view.isHost ? <HostGoneOverlay /> : null}
    </div>
  )
}

export function App() {
  useLocale()
  const params = new URLSearchParams(location.search)
  const roomParam = params.get('room')
  const isHost = !roomParam
  const fileHint = location.protocol === 'file:'

  const [store, setStore] = useState<GameStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [share, setShare] = useState('')
  const [roomOpen, setRoomOpen] = useState(false)

  const bootRoom = useCallback(
    (code: string, host: boolean, tableSize: 2 | 4, targetScore: 15 | 30) => {
      const room = connectRoom(code, (details) => {
        setError(details.error)
      })
      const next = startGame(room, { isHost: host, tableSize, targetScore, roomCode: code })
      setStore(next)
    },
    [],
  )

  useEffect(() => {
    if (fileHint || !roomParam || store) return
    try {
      bootRoom(roomParam, false, 2, 15)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [bootRoom, fileHint, roomParam, store])

  function onCreate(tableSize: 2 | 4, targetScore: 15 | 30) {
    try {
      const code = genCode()
      const link = shareLink(code)
      history.replaceState(null, '', link)
      setShare(link)
      setRoomOpen(true)
      setError(null)
      bootRoom(code, true, tableSize, targetScore)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const showLobby = fileHint || !!error || !store

  return (
    <>
      <LangSwitch />
      {showLobby && (
        <Lobby
          isHost={isHost}
          joining={!!roomParam && !store}
          roomCode={roomParam}
          error={error}
          fileHint={fileHint}
          roomOpen={roomOpen}
          shareLink={share}
          onCreate={onCreate}
        />
      )}
      {store && !error && <Table store={store} />}
    </>
  )
}

