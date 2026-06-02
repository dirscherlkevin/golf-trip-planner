import client from './client'

export const suggestRestaurants = (tripId, params) =>
  client.post(`/trips/${tripId}/restaurants/suggest`, params).then(r => r.data)

export const getSavedPicks = (tripId, roundId) => {
  const params = roundId != null ? { round_id: roundId } : {}
  return client.get(`/trips/${tripId}/restaurants`, { params }).then(r => r.data)
}

export const saveRestaurantPick = (tripId, data) =>
  client.post(`/trips/${tripId}/restaurants`, data).then(r => r.data)

export const voteOnPick = (tripId, pickId, vote) =>
  client.post(`/trips/${tripId}/restaurants/${pickId}/vote`, { vote }).then(r => r.data)

export const deleteRestaurantPick = (tripId, pickId) =>
  client.delete(`/trips/${tripId}/restaurants/${pickId}`).then(r => r.data)
