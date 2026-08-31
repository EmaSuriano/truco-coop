import { useState } from 'react'
import { motion } from 'motion/react'
import { t } from '../i18n'
import { useLocale } from '../hooks'
import { publicUrl } from '../url'

type Props = {
  isHost: boolean
  joining: boolean
  roomCode: string | null
  error: string | null
  fileHint: boolean
  roomOpen: boolean
  shareLink: string
  onCreate: (tableSize: 2 | 4, targetScore: 15 | 30) => void
}

export function Lobby({
  isHost,
  joining,
  roomCode,
  error,
  fileHint,
  roomOpen,
  shareLink,
  onCreate,
}: Props) {
  useLocale()
  const [tableSize, setTableSize] = useState<2 | 4>(2)
  const [targetScore, setTargetScore] = useState<15 | 30>(15)
  const [copied, setCopied] = useState(false)
  const [titleOk, setTitleOk] = useState(false)
  const [titleFail, setTitleFail] = useState(false)
  const corner = publicUrl('ui/frame-corner.png')

  let status = t('waiting')
  if (fileHint) status = t('fileHint')
  else if (error) status = error
  else if (joining && roomCode) status = t('joining', { room: roomCode })
  else if (roomOpen) status = tableSize === 2 ? t('wait1') : t('wait3')

  function copy() {
    void navigator.clipboard.writeText(shareLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div id="overlay">
      <motion.div
        id="card"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'tween', ease: 'easeOut', duration: 0.35 }}
      >
        <img className="frameCorner tl" alt="" src={corner} />
        <img className="frameCorner tr" alt="" src={corner} />
        <img className="frameCorner bl" alt="" src={corner} />
        <img className="frameCorner br" alt="" src={corner} />
        <h1>
          {!titleFail && (
            <img
              id="titleArt"
              className={titleOk ? 'ok' : ''}
              alt="Truco"
              src={publicUrl('ui/title-truco.png')}
              onLoad={() => setTitleOk(true)}
              onError={() => setTitleFail(true)}
            />
          )}
          <span className="titleFallback">Truco Coop</span>
        </h1>
        <p className="sub">{t('sub')}</p>

        {isHost && !joining && (
          <>
            <div className="row" id="tableSizeRow">
              <label>{t('players')}</label>
              <div className="choice">
                <label className="choiceOpt">
                  <input
                    type="radio"
                    name="tableSize"
                    value="2"
                    checked={tableSize === 2}
                    onChange={() => setTableSize(2)}
                  />{' '}
                  {t('size2')}
                </label>
                <label className="choiceOpt">
                  <input
                    type="radio"
                    name="tableSize"
                    value="4"
                    checked={tableSize === 4}
                    onChange={() => setTableSize(4)}
                  />{' '}
                  {t('size4')}
                </label>
              </div>
            </div>

            <div className="row" id="targetScoreRow">
              <label>{t('playTo')}</label>
              <div className="choice">
                <label className="choiceOpt">
                  <input
                    type="radio"
                    name="targetScore"
                    value="15"
                    checked={targetScore === 15}
                    onChange={() => setTargetScore(15)}
                  />{' '}
                  15
                </label>
                <label className="choiceOpt">
                  <input
                    type="radio"
                    name="targetScore"
                    value="30"
                    checked={targetScore === 30}
                    onChange={() => setTargetScore(30)}
                  />{' '}
                  30
                </label>
              </div>
            </div>

            <div className="row">
              <button
                className="primary"
                id="hostBtn"
                disabled={fileHint || roomOpen}
                onClick={() => onCreate(tableSize, targetScore)}
              >
                {roomOpen ? t('roomOpen') : t('createRoom')}
              </button>
            </div>
          </>
        )}

        {shareLink && (
          <div id="linkRow" className="show">
            <label>{t('shareLink')}</label>
            <div id="linkBox">
              <input type="text" id="linkInput" readOnly value={shareLink} />
              <button id="copyBtn" type="button" onClick={copy}>
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        )}

        <div id="status" className={error || fileHint ? 'err' : ''}>
          {status}
        </div>
      </motion.div>
    </div>
  )
}
