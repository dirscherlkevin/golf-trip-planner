import { create } from 'zustand'
import client from '../api/client'
import { getPhases, lockPhase, reopenPhase } from '../api/phases'

export const useTripStore = create((set, get) => ({
  trip: null,
  phases: [],   // [{phase, status, locked_at, locked_by}]
  loading: false,
  error: null,

  loadTrip: async (id) => {
    set({ loading: true, error: null })
    try {
      const [tripRes, phasesRes] = await Promise.all([
        client.get(`/trips/${id}`),
        getPhases(id),
      ])
      set({ trip: tripRes.data, phases: phasesRes, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
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
    // Refresh both — locking availability sets trip_start/trip_end on the trip row
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
    // Returns the phase name that is currently "open"
    const { phases } = get()
    return phases.find(p => p.status === 'open')?.phase ?? null
  },
}))
