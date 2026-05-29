import client from './client'

export const getRounds = (tripId) => client.get(`/trips/${tripId}/rounds`).then(r => r.data)
export const setupRounds = (tripId, rounds) => client.post(`/trips/${tripId}/rounds/setup`, { rounds }).then(r => r.data)
export const generateMoreCourses = (tripId, roundId) => client.post(`/trips/${tripId}/rounds/${roundId}/generate-more`)
export const nominateCourse = (tripId, roundId, courseData) => client.post(`/trips/${tripId}/rounds/${roundId}/nominate`, { course_data: courseData }).then(r => r.data)
export const voteOnCourse = (tripId, roundId, nomId, vote) => client.post(`/trips/${tripId}/rounds/${roundId}/nominations/${nomId}/vote`, { vote })
export const lockRound = (tripId, roundId, nominationId) => client.post(`/trips/${tripId}/rounds/${roundId}/lock`, { nomination_id: nominationId }).then(r => r.data)
export const unlockRound = (tripId, roundId) => client.delete(`/trips/${tripId}/rounds/${roundId}/lock`).then(r => r.data)
export const removeCourseNomination = (tripId, roundId, nomId) => client.delete(`/trips/${tripId}/rounds/${roundId}/nominations/${nomId}`).then(r => r.data)
