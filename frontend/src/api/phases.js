import client from './client'

export const getPhases = (tripId) => client.get(`/trips/${tripId}/phases`).then(r => r.data)
export const lockPhase = (tripId, phase, body = {}) => client.post(`/trips/${tripId}/phases/${phase}/lock`, body).then(r => r.data)
export const reopenPhase = (tripId, phase) => client.post(`/trips/${tripId}/phases/${phase}/reopen`).then(r => r.data)
