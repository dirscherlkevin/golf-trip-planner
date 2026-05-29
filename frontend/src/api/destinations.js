import client from './client'

export const generateDestinations = (tripId, inputs) =>
  client.post(`/trips/${tripId}/destinations/generate`, inputs).then(r => r.data)

export const getDestinations = (tripId) =>
  client.get(`/trips/${tripId}/destinations`).then(r => r.data)

export const voteOnDestination = (tripId, destinationIndex, vote) =>
  client.post(`/trips/${tripId}/destinations/vote`, { destination_index: destinationIndex, vote })

export const lockDestination = (tripId, destinationIndex, override = false) =>
  client.post(`/trips/${tripId}/destinations/lock`, { destination_index: destinationIndex, override }).then(r => r.data)

export const nominateDestination = (tripId, data) =>
  client.post(`/trips/${tripId}/destinations/nominate`, data).then(r => r.data)

export const unlockDestination = (tripId) =>
  client.delete(`/trips/${tripId}/destinations/lock`).then(r => r.data)
