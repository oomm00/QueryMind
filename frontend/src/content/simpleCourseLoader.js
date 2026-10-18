/**
 * Small loader for catalog courses whose authored material is organised as
 * topic.json plus one JSON body per concept.  Operating Systems keeps its
 * richer loader; these courses use the same public course/topic/concept shape.
 */
export function createCourseLoader(modules, course, aliases = {}) {
  const topics = new Map()
  const concepts = new Map()
  const topicFiles = Object.entries(modules)

  for (const [path, mod] of topicFiles) {
    const data = mod?.default ?? mod
    const topicMatch = path.match(/^\.\/([^/]+)\/topic\.json$/)
    const conceptMatch = path.match(/^\.\/([^/]+)\/concepts\/([^/]+)\.json$/)
    if (topicMatch) topics.set(topicMatch[1], { ...data, id: data.id ?? topicMatch[1] })
    if (conceptMatch) {
      const topicId = conceptMatch[1]
      const id = data.id ?? conceptMatch[2]
      concepts.set(`${topicId}:${id}`, { ...data, id, topicId })
    }
  }

  const resolveCourse = (id) => aliases[id] ?? id
  const conceptFor = (topicId, id) => concepts.get(`${topicId}:${id}`) ?? null
  const conceptWithGraph = (topicId, concept) => ({
    ...concept,
    topicId,
    prerequisiteIds: concept.prerequisiteIds ?? [],
    prerequisiteLabels: concept.prerequisiteLabels ?? {},
    prerequisites: (concept.prerequisiteIds ?? [])
      .map((id) => conceptFor(topicId, id))
      .filter(Boolean)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        topicId,
        label: concept.prerequisiteLabels?.[entry.id] ?? null,
      })),
    lessonIds: [],
    lessons: [],
    lessonQuestions: [],
    resourceCount: (concept.resources ?? []).length,
    questionCount: (concept.questions ?? []).length,
  })

  const getTopic = (id) => {
    const source = topics.get(id)
    if (!source) return null
    const conceptIds = source.conceptIds ?? Object.keys(source.concepts ?? {})
    const resolved = conceptIds
      .map((conceptId) => conceptFor(id, conceptId))
      .filter(Boolean)
      .map((concept) => conceptWithGraph(id, concept))
    return {
      ...source,
      id,
      conceptIds: resolved.map((concept) => concept.id),
      concepts: resolved,
      lessonIds: [],
      resourceCount: resolved.reduce((sum, concept) => sum + concept.resourceCount, 0),
      questionCount: resolved.reduce((sum, concept) => sum + concept.questionCount, 0),
    }
  }

  const getCourse = (id = course.id) => {
    if (resolveCourse(id) !== course.id) return null
    return {
      ...course,
      topics: course.topicIds.map(getTopic).filter(Boolean).map((topic) => ({
        id: topic.id,
        title: topic.title,
        subject: topic.subject,
        conceptCount: topic.conceptIds.length,
        conceptIds: topic.conceptIds,
        lessonCount: 0,
        lessonIds: [],
        resourceCount: topic.resourceCount,
        questionCount: topic.questionCount,
      })),
    }
  }

  return {
    COURSE: course,
    getCourse,
    getTopic,
    getConcept: (id) => {
      for (const topicId of course.topicIds) {
        const concept = conceptFor(topicId, id)
        if (concept) return conceptWithGraph(topicId, concept)
      }
      return null
    },
    listTopics: () => course.topicIds.map(getTopic).filter(Boolean),
  }
}
