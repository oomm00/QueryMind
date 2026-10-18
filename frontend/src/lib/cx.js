/**
 * cx — tiny className joiner (falsy values are dropped).
 */
export function cx(...parts) {
  return parts.flat(Infinity).filter(Boolean).join(' ')
}
