/**
 * vitest.setup — what every test file gets.
 *
 * jest-dom's matchers, and a clean browser store between tests: mastery lives in
 * localStorage and session state in sessionStorage, so a test that leaves either
 * behind would change what the next one sees.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
