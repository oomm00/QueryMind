/**
 * Mock Auth Data & Handlers
 */

export const mockAuthUser = {
  user_id: 'mock-user-123',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  is_active: true,
  is_verified: true,
  created_at: '2026-01-01T00:00:00Z',
}

export const mockTokenResponse = {
  access_token: 'mock-jwt-token-header.payload.signature',
  refresh_token: 'mock-refresh-token-xyz',
  token_type: 'bearer',
  user_id: mockAuthUser.user_id,
  email: mockAuthUser.email,
}
