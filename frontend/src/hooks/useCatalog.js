/**
 * useCatalog — the Explore course catalog.
 *
 * Reads through the existing mock dispatcher: while the catalog endpoint has no
 * backend implementation (isMocked('catalog')) it serves the mock catalog with
 * simulated latency, otherwise it calls the real API. TanStack Query caches the
 * result, so search and filters re-run instantly on the cached list.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { fetchMockCatalog } from '../api/mocks/data/catalog.js'
import { apiFetch } from '../api/client.js'

const QUERY_KEY = ['catalog']

async function getCatalog() {
  if (isMocked('catalog')) {
    return fetchMockCatalog()
  }
  // Real endpoint lands with the backend catalog service; until then this keeps
  // the same shape as the mock list.
  return apiFetch('/catalog')
}

export function useCatalog() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getCatalog,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default useCatalog
