/**
 * useDocuments — the Upload page's two reads: the caller's document list and
 * the subject/topic suggestions both pickers build from.
 *
 * TanStack Query caches them under a shared ['documents'] prefix, so one
 * invalidateQueries after an upload refreshes the table and every suggestion
 * list at once.
 */

import { useQuery } from '@tanstack/react-query'
import { documentsApi } from '../api/endpoints/documents.js'

export const DOCUMENTS_KEY = ['documents']

export function useDocuments() {
  return useQuery({
    queryKey: ['documents', 'list'],
    queryFn: () => documentsApi.list(),
    staleTime: 30_000,
    retry: false,
  })
}

export function useDocumentTopics() {
  return useQuery({
    queryKey: ['documents', 'topics'],
    queryFn: () => documentsApi.topics(),
    staleTime: 30_000,
    retry: false,
  })
}
