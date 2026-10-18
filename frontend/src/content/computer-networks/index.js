import { createCourseLoader } from '../simpleCourseLoader.js'

const modules = import.meta.glob('./**/*.json', { eager: true })
export const COURSE = {"id":"computer-networks","title":"Computer Networks","summary":"Packets, protocols, naming and reliable communication across connected systems.","level":"intermediate","topicIds":["network-fundamentals","transport-services","application-protocols","network-operations"]}
const loader = createCourseLoader(modules, COURSE, { "computer-networks": "computer-networks" })
export const { getCourse, getTopic, getConcept, listTopics } = loader
export default loader
