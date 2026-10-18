/**
 * topicSuggestions — the two dropdowns' option lists, from GET /documents/topics.
 *
 * Subject and Topic must match stored material exactly (retrieval filters on
 * the pair), so both pickers only ever offer what exists. When the chosen
 * subject matches a stored one, its topics are shown; when it doesn't yet
 * (the student is typing their own), the flattened set still helps rather
 * than blocking.
 */

/** Every subject the caller has uploaded under, A-Z (server order). */
export function subjectList(rows) {
  return (rows ?? []).map((row) => row.subject)
}

/**
 * The topics to offer for `subject`: that subject's own list when it exists,
 * otherwise every distinct topic across subjects.
 */
export function topicsFor(rows, subject) {
  const list = rows ?? []
  const exact = list.find((row) => row.subject === subject)
  if (exact) return exact.topics
  return [...new Set(list.flatMap((row) => row.topics))]
}
