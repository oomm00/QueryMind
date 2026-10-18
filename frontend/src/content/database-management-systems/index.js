import { createCourseLoader } from '../simpleCourseLoader.js'

const modules = import.meta.glob('./**/*.json', { eager: true })
export const COURSE = {"id":"database-management-systems","title":"Database Management Systems","summary":"Relational modelling, SQL, indexing, transactions and durable storage.","level":"intermediate","topicIds":["relational-foundations","query-processing","concurrency-recovery","distributed-data"]}
const loader = createCourseLoader(modules, COURSE, { "database-management-systems": "database-management-systems" })
export const { getCourse, getTopic, getConcept, listTopics } = loader
export default loader
