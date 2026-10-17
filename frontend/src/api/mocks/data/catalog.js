import { delay } from '../config.js'

/**
 * Mock Catalog Data — the Explore course catalog.
 * Contract shape: { id, title, summary, icon, level, category, topicCount, hours,
 *                  prerequisites[], status, completion, estimatedMastery, saved }
 *
 * Status is 'not_started' | 'enrolled'; completion and estimatedMastery are 0..1.
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
    topicCount: 12,
    hours: 14,
    prerequisites: ['Data Structures & Algorithms'],
    status: 'enrolled',
    completion: 0.62,
    estimatedMastery: 0.58,
    saved: true,
  },
  {
    id: 'data-structures-algorithms',
    title: 'Data Structures & Algorithms',
    summary:
      'Arrays, trees, graphs, dynamic programming and the complexity analysis to reason about all of it.',
    icon: 'nodes',
    level: 'Beginner',
    category: 'Computer Science',
    topicCount: 15,
    hours: 18,
    prerequisites: [],
    status: 'enrolled',
    completion: 0.34,
    estimatedMastery: 0.41,
    saved: true,
  },
  {
    id: 'database-management-systems',
    title: 'Database Management Systems',
    summary:
      'Relational modelling, SQL, indexing, transactions and the trade-offs behind storage engines.',
    icon: 'database',
    level: 'Intermediate',
    category: 'Data',
    topicCount: 10,
    hours: 12,
    prerequisites: [],
    status: 'not_started',
    completion: 0,
    estimatedMastery: 0,
    saved: false,
  },
  {
    id: 'computer-networks',
    title: 'Computer Networks',
    summary:
      'From packets and the OSI model to TCP congestion control, DNS and how the web reaches you.',
    icon: 'globe',
    level: 'Intermediate',
    category: 'Systems',
    topicCount: 11,
    hours: 13,
    prerequisites: ['Operating Systems'],
    status: 'not_started',
    completion: 0,
    estimatedMastery: 0,
    saved: true,
  },
  {
    id: 'system-design',
    title: 'System Design',
    summary:
      'Designing scalable services: caching, replication, queues, consistency models and capacity planning.',
    icon: 'layers',
    level: 'Advanced',
    category: 'Architecture',
    topicCount: 9,
    hours: 11,
    prerequisites: ['Computer Networks', 'Database Management Systems'],
    status: 'not_started',
    completion: 0,
    estimatedMastery: 0,
    saved: false,
  },
  {
    id: 'object-oriented-programming',
    title: 'Object-Oriented Programming',
    summary:
      'Encapsulation, inheritance, polymorphism and the design patterns that make OO code hold up.',
    icon: 'code',
    level: 'Beginner',
    category: 'Programming',
    topicCount: 8,
    hours: 9,
    prerequisites: [],
    status: 'enrolled',
    completion: 0.85,
    estimatedMastery: 0.79,
    saved: false,
  },
  {
    id: 'software-engineering',
    title: 'Software Engineering',
    summary:
      'Testing strategies, version control, CI/CD and the practices that keep a codebase maintainable.',
    icon: 'wrench',
    level: 'Beginner',
    category: 'Programming',
    topicCount: 9,
    hours: 10,
    prerequisites: [],
    status: 'not_started',
    completion: 0,
    estimatedMastery: 0,
    saved: false,
  },
  {
    id: 'artificial-intelligence',
    title: 'Artificial Intelligence',
    summary:
      'Search, knowledge representation, machine learning fundamentals and modern neural networks.',
    icon: 'spark',
    level: 'Advanced',
    category: 'AI',
    topicCount: 13,
    hours: 16,
    prerequisites: ['Data Structures & Algorithms'],
    status: 'not_started',
    completion: 0,
    estimatedMastery: 0,
    saved: true,
  },
  {
    id: 'backend-development',
    title: 'Backend Development',
    summary:
      'REST and RPC APIs, authentication, background jobs and deploying services that stay up.',
    icon: 'server',
    level: 'Intermediate',
    category: 'Programming',
    topicCount: 12,
    hours: 15,
    prerequisites: ['Database Management Systems'],
    status: 'not_started',
    completion: 0,
    estimatedMastery: 0,
    saved: false,
  },
]

/** Simulated fetch — mirrors the latency behaviour of the other mock modules. */
export async function fetchMockCatalog() {
  await delay()
  return MOCK_CATALOG
}

export default MOCK_CATALOG
