/**
 * studyMaterial — which study links the student says they opened.
 *
 * Study material is optional: nothing in the app gates practice on it, and this
 * store never feeds mastery. It records one human action ("I opened this") so a
 * list of links can show what has been looked at and what has not.
 *
 * Kept in sessionStorage, like lessonProgress: it is a session log, not a
 * durable record, and it is discarded when the tab closes.
 */

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'qm.study-material.v1'

const canStore = typeof window !== 'undefined' && Boolean(window.sessionStorage)

function emptyState() {
  return { opened: {} }
}

function read() {
  if (!canStore) return emptyState()
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    return { opened: parsed.opened ?? {} }
  } catch {
    return emptyState()
  }
}

let state = read()
const listeners = new Set()

function commit() {
  if (canStore) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage full or blocked: keep the in-memory copy and carry on.
    }
  }
  for (const listener of listeners) listener()
}

export function subscribeStudyMaterial(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getStudyMaterialSnapshot() {
  return state
}

/** Resources are identified by their URL, which the schema keeps unique. */
export function isResourceOpened(url) {
  return Boolean(url && state.opened[url])
}

export function markResourceOpened(url, opened = true) {
  if (!url) return
  const openedMap = { ...state.opened }
  if (opened) openedMap[url] = new Date().toISOString()
  else delete openedMap[url]
  state = { ...state, opened: openedMap }
  commit()
}

export function toggleResourceOpened(url) {
  markResourceOpened(url, !isResourceOpened(url))
}

/** How many of these resources are marked as opened. */
export function countOpened(resources = []) {
  return resources.filter((resource) => isResourceOpened(resource?.url)).length
}

export function resetStudyMaterial() {
  state = emptyState()
  commit()
}

export function useStudyMaterial() {
  return useSyncExternalStore(
    subscribeStudyMaterial,
    getStudyMaterialSnapshot,
    getStudyMaterialSnapshot
  )
}
