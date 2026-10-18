import { delay } from '../config.js'

/**
 * Mock Catalog Data — the Explore course catalog.
 *
 * Shape: { id, title, summary, icon, level, category, hours, prerequisites[] }
 *
 * The catalog describes courses, nothing more. It deliberately carries no
 * enrollment, completion, mastery, bookmark or topic-count figures: those are
 * facts about a student or about content, and inventing them here is what the
 * app used to do. Enrollment and bookmarks come from the per-user stores, and a
 * topic count is read from the course's content when there is any.
 */

export const MOCK_CATALOG = [
  {
    id: 'operating-systems',
    title: 'Operating Systems',
    summary:
      'Processes, memory management, file systems and scheduling — how a computer actually runs your programs.',
    icon: 'chip',
    level: 'Intermediate',
    category: 'Systems',
    hours: 14,
    prerequisites: ['Data Structures & Algorithms'],
  },
  {
    id: 'data-structures-algorithms',
    title: 'Data Structures & Algorithms',
    summary:
      'Arrays, trees, graphs, dynamic programming and the complexity analysis to reason about all of it.',
    icon: 'nodes',
    level: 'Beginner',
    category: 'Computer Science',
    hours: 18,
    prerequisites: [],
  },
  {
    id: 'database-management-systems',
    title: 'Database Management Systems',
    summary:
      'Relational modelling, SQL, indexing, transactions and the trade-offs behind storage engines.',
    icon: 'database',
    level: 'Intermediate',
    category: 'Data',
    hours: 12,
    prerequisites: [],
  },
  {
    id: 'computer-networks',
    title: 'Computer Networks',
    summary:
      'From packets and the OSI model to TCP congestion control, DNS and how the web reaches you.',
    icon: 'globe',
    level: 'Intermediate',
    category: 'Systems',
    hours: 13,
    prerequisites: ['Operating Systems'],
  },
  {
    id: 'system-design',
    title: 'System Design',
    summary:
      'Designing scalable services: caching, replication, queues, consistency models and capacity planning.',
    icon: 'layers',
    level: 'Advanced',
    category: 'Architecture',
    hours: 11,
    prerequisites: ['Computer Networks', 'Database Management Systems'],
  },
  {
    id: 'object-oriented-programming',
    title: 'Object-Oriented Programming',
    summary:
      'Encapsulation, inheritance, polymorphism and the design patterns that make OO code hold up.',
    icon: 'code',
    level: 'Beginner',
    category: 'Programming',
    hours: 9,
    prerequisites: [],
  },
  {
    id: 'software-engineering',
    title: 'Software Engineering',
    summary:
      'Testing strategies, version control, CI/CD and the practices that keep a codebase maintainable.',
    icon: 'wrench',
    level: 'Beginner',
    category: 'Programming',
    hours: 10,
    prerequisites: [],
  },
  {
    id: 'artificial-intelligence',
    title: 'Artificial Intelligence',
    summary:
      'Search, knowledge representation, machine learning fundamentals and modern neural networks.',
    icon: 'spark',
    level: 'Advanced',
    category: 'AI',
    hours: 16,
    prerequisites: ['Data Structures & Algorithms'],
  },
  {
    id: 'backend-development',
    title: 'Backend Development',
    summary:
      'REST and RPC APIs, authentication, background jobs and deploying services that stay up.',
    icon: 'server',
    level: 'Intermediate',
    category: 'Programming',
    hours: 15,
    prerequisites: ['Database Management Systems'],
  },
]

/** Simulated fetch — mirrors the latency behaviour of the other mock modules. */
export async function fetchMockCatalog() {
  await delay()
  return MOCK_CATALOG
}

export default MOCK_CATALOG
