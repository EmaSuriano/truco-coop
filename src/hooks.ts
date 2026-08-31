import { useSyncExternalStore } from 'react'
import type { GameStore, ViewState } from './game'
import { getLocale, onLocale } from './i18n'
import type { Locale } from './i18n'

export function useLocale(): Locale {
  return useSyncExternalStore(onLocale, getLocale, getLocale)
}

export function useGame(store: GameStore): ViewState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
