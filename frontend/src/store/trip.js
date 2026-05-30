import { create } from 'zustand'
import client from '../api/client'
import { getPhases, lockPhase, reopenPhase } from '../api/phases'

export const useTripStore = create((set, get) => ({
  trip: null,
  phases: [],
  loading: false,
  refreshing: false,
  error: null,

  loadTrip: async (id) => {
    const currentTrip = get().trip
    const isFirstLoad = !currentTrip || currentTrip.id !== parseInt(id)
    if (isFirstLoad) {
      set({ loading: true, error: null })
    } else {
      set({ refreshing: true })
    }
    try {
      const [tripRes, phasesRes] = await Promise.all([
        client.get(`/trips/${id}`),
        getPhases(id),
      ])
      set({ trip: tripRes.data, phases: phasesRes, loading: false, refreshing: false })
    } catch (e) {
      set({ error: e.message, loading: false, refreshing: false })
    }
  },

  refreshPhases: async () => {
    const { trip } = get()
    if (!trip) return
    const phases = await getPhases(trip.id)
    set({ phases })
  },

  lockPhase: async (phase, body = {}) => {
    const { trip } = get()
    await lockPhase(trip.id, phase, body)
    const [tripRes, phases] = await Promise.all([
      client.get(`/trips/${trip.id}`),
      getPhases(trip.id),
    ])
    set({ trip: tripRes.data, phases })
  },

  reopenPhase: async (phase) => {
    const { trip } = get()
    await reopenPhase(trip.id, phase)
    await get().refreshPhases()
  },

  currentPhase: () => {
    const { phases } = get()
    return phases.find(p => p.status === 'open')?.phase ?? null
  },
}))
