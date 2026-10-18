import { createCourseLoader } from '../simpleCourseLoader.js'

const modules = import.meta.glob('./**/*.json', { eager: true })
export const COURSE = {"id":"system-design","title":"System Design","summary":"Scalable services built with clear trade-offs around reliability, latency and cost.","level":"advanced","topicIds":["requirements-capacity","storage-and-caching","distributed-systems","resilience-operations"]}
const loader = createCourseLoader(modules, COURSE, { "system-design": "system-design" })
export const { getCourse, getTopic, getConcept, listTopics } = loader
export default loader
