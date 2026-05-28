import client from './client'

export const submitAvailability = (tripId, dateRanges, happySpend, hardLimit) =>
  client.post(`/trips/${tripId}/availability`, {
    date_ranges: dateRanges,
    happy_spend: happySpend || null,
    hard_limit: hardLimit || null,
  })

export const getAvailability = (tripId) =>
  client.get(`/trips/${tripId}/availability`).then(r => r.data)

export const getOverlap = (tripId) =>
  client.get(`/trips/${tripId}/availability/overlap`).then(r => r.data)

export const nudgeMembers = (tripId) =>
  client.post(`/trips/${tripId}/nudge`)
