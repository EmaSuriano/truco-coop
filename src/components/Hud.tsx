import { TEAM_COUNT, teamOf } from '../config'
import { actorSeat, cardLabel } from '../game'
import type { ViewState } from '../game'
import { t } from '../i18n'
import { useLocale } from '../hooks'
import { chantLabel } from '../game'

export function Hud({ view }: { view: ViewState }) {
  useLocale()
  const pub = view.lastPub
  const seats = pub?.seatCount || 2
  const actor = actorSeat(pub)
  const handText =
    view.mySeat < 0 ? t('spectating') : view.myHand.map(cardLabel).join(' ') || '—'

  let turnText = '—'
  if (!pub) turnText = '—'
  else if (pub.winnerTeam !== null) turnText = t('matchOver', { team: pub.winnerTeam })
  else if (pub.phase === 'wait') {
    turnText = t('waitingHud', { filled: pub.seatsFilled, seats: pub.seatCount || seats })
  } else if (pub.pending) {
    const chant = chantLabel(pub.pending.ladder[pub.pending.ladder.length - 1] || pub.lastChant)
    turnText =
      actor === view.mySeat
        ? t('youAnswer', { chant })
        : actor !== null
          ? t('pAnswers', { chant, n: actor })
          : chant
  } else if (actor !== null && pub.disconnected?.[actor]) turnText = t('waitingReconnect', { n: actor })
  else if (actor === view.mySeat) turnText = t('yourTurn')
  else if (actor !== null) turnText = t('pPlays', { n: actor })

  const cap = pub ? pub.target || 15 : 15
  const origin = view.mySeat < 0 ? 0 : view.mySeat
  const us = teamOf(origin, seats)
  const them = (us + 1) % TEAM_COUNT
  const usScore = pub ? pub.scores[us] ?? 0 : 0
  const themScore = pub ? pub.scores[them] ?? 0 : 0
  let scoreText = '—'
  if (pub) {
    scoreText =
      view.mySeat < 0
        ? `${pub.scores[0] ?? 0}/${cap}–${pub.scores[1] ?? 0}/${cap}`
        : `${t('us')} ${usScore}/${cap}  ${t('them')} ${themScore}/${cap}`
  }

  return (
    <div id="hud">
      <span className="you">■ {t('you')}</span>
      {' '}
      {t('cards')}: <span id="hudHand">{handText}</span>
      {' '}|{' '}
      {t('turn')}: <span id="hudTurn">{turnText}</span>
      {' '}|{' '}
      {t('score')}: <span id="hudScore">{scoreText}</span>
      {' '}|{' '}
      <span className="peer">■ {t('peers')}</span> {t('connected')}:{' '}
      <span id="peerCount">{view.peerCount}</span>
    </div>
  )
}
