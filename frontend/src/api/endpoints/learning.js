import { apiFetch } from '../client.js'

export async function fetchLearningTopics() {
  return apiFetch('/learning/topics')
}

export async function fetchLearningTopic(topicId) {
  return apiFetch(`/learning/topics/${topicId}`)
}

export async function enrollLearningTopic(topic, subject = 'General') {
  return apiFetch('/learning/topics', {
    method: 'POST',
    body: JSON.stringify({ topic, subject }),
  })
}
