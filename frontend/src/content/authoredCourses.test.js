import { describe, it, expect } from 'vitest'
import { getAuthoredCourse, allAuthoredCourseIds } from './authoredCourses.js'
import { practiceCourse, contentCourseIds } from './practiceBank.js'

describe('Authored Courses Catalog', () => {
  it('registers all key catalog courses with rich content', () => {
    const ids = allAuthoredCourseIds()
    expect(ids).toContain('database-management-systems')
    expect(ids).toContain('computer-networks')
    expect(ids).toContain('data-structures-algorithms')
  })

  it('provides complete topic trees, lessons, and questions for database-management-systems', () => {
    const dbms = practiceCourse('database-management-systems')
    expect(dbms).not.toBeNull()
    expect(dbms.title).toBe('Database Management Systems')
    expect(dbms.topics.length).toBeGreaterThanOrEqual(2)
    
    // Check first topic: Transactions & ACID Properties
    const topic1 = dbms.topics[0]
    expect(topic1.title).toBe('Transactions & ACID Properties')
    expect(topic1.concepts.length).toBeGreaterThanOrEqual(1)
    expect(topic1.concepts[0].questions.length).toBeGreaterThanOrEqual(2)
    expect(topic1.lessons.length).toBeGreaterThanOrEqual(1)
  })

  it('provides complete topic trees, lessons, and questions for computer-networks', () => {
    const net = practiceCourse('computer-networks')
    expect(net).not.toBeNull()
    expect(net.title).toBe('Computer Networks')
    expect(net.topics.length).toBeGreaterThanOrEqual(1)
    expect(net.topics[0].concepts[0].questions.length).toBeGreaterThanOrEqual(2)
    expect(net.topics[0].lessons.length).toBeGreaterThanOrEqual(1)
  })

  it('provides complete topic trees, lessons, and questions for data-structures-algorithms', () => {
    const dsa = practiceCourse('data-structures-algorithms')
    expect(dsa).not.toBeNull()
    expect(dsa.title).toBe('Data Structures & Algorithms')
    expect(dsa.topics.length).toBeGreaterThanOrEqual(1)
    expect(dsa.topics[0].concepts[0].questions.length).toBeGreaterThanOrEqual(2)
    expect(dsa.topics[0].lessons.length).toBeGreaterThanOrEqual(1)
  })

  it('integrates into contentCourseIds', () => {
    const ids = contentCourseIds()
    expect(ids).toContain('os')
    expect(ids).toContain('database-management-systems')
    expect(ids).toContain('computer-networks')
    expect(ids).toContain('data-structures-algorithms')
  })
})
