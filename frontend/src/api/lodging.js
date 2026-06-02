import client from './client'

export const getLodging = (tripId) => client.get(`/trips/${tripId}/lodging`).then(r => r.data)
export const setupLodging = (tripId, lodgingType, roomsNeeded, bedsNeeded) => client.post(`/trips/${tripId}/lodging/setup`, { lodging_type: lodgingType, rooms_needed: roomsNeeded ?? null, beds_needed: bedsNeeded ?? null }).then(r => r.data)
export const generateMoreLodging = (tripId) => client.post(`/trips/${tripId}/lodging/generate-more`)
export const nominateLodging = (tripId, optionData) => {
  const body = optionData?.option_data ? optionData : { option_data: optionData }
  return client.post(`/trips/${tripId}/lodging/nominate`, body).then(r => r.data)
}
export const voteOnLodging = (tripId, optId, vote) => client.post(`/trips/${tripId}/lodging/options/${optId}/vote`, { vote })
export const lockLodging = (tripId, optId) => client.post(`/trips/${tripId}/lodging/options/${optId}/lock`).then(r => r.data)
export const unlockLodging = (tripId) => client.delete(`/trips/${tripId}/lodging/lock`).then(r => r.data)
export const unlockLodgingOption = (tripId, optId) => client.delete(`/trips/${tripId}/lodging/options/${optId}/lock`).then(r => r.data)
export const removeLodgingOption = (tripId, optId) => client.delete(`/trips/${tripId}/lodging/options/${optId}`).then(r => r.data)
