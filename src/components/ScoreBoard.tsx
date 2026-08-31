import { TEAM_COUNT, teamOf } from '../config'
import { actorSeat, chantLabel } from '../game'
import type { ViewState } from '../game'
import { t } from '../i18n'
import { useLocale } from '../hooks'

export function ScoreBoard({ view }: { view: ViewState }) {
  useLocale()
  const pub = view.lastPub
  const seats = pub?.seatCount || 2
  const actor = actorSeat(pub)
  const cap = pub ? pub.target || 15 : 15
  const origin = view.mySeat < 0 ? 0 : view.mySeat
  const us = teamOf(origin, seats)
  const them = (us + 1) % TEAM_COUNT
  const usScore = pub ? pub.scores[us] ?? 0 : 0
  const themScore = pub ? pub.scores[them] ?? 0 : 0

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
  } else if (actor === view.mySeat) turnText = t('yourTurn')
  else if (actor !== null) turnText = t('pPlays', { n: actor })

  return (
    <div id="scoreBoard">
      <div className="scoreField">
        <div className="scoreCol">
          <div className="scoreName">{t('us')}</div>
          <div className="scoreNum">
            <span>{usScore}</span>
            <span className="scoreCap">/{cap}</span>
          </div>
        </div>
        <div id="turnBanner">{turnText}</div>
        <div className="scoreCol them">
          <div className="scoreName">{t('them')}</div>
          <div className="scoreNum">
            <span>{themScore}</span>
            <span className="scoreCap">/{cap}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
