import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/auth'
import { useTripStore } from '../store/trip'
import client from '../api/client'

export default function MemberPanel({ trip }) {
  const user = useAuthStore(s => s.user)
  const phases = useTripStore(s => s.phases)
  const openPhase = phases.find(p => p.status === 'open')?.phase ?? null
  const [availability, setAvailability] = useState(null)
  const [nudging, setNudging] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [pastGolfers, setPastGolfers] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!trip) return
    client.get(`/trips/${trip.id}/availability`)
      .then(r => setAvailability(r.data))
      .catch(() => {})
  }, [trip?.id])

  const respondedIds = new Set(availability?.responded_user_ids ?? [])

  const nudge = async () => {
    setNudging(true)
    try { await client.post(`/trips/${trip.id}/nudge`) } finally { setNudging(false) }
  }

  const onEmailChange = (val) => {
    setInviteEmail(val)
    setInviteError(null)
    clearTimeout(searchTimer.current)
    if (val.length < 2) { setSearchResults([]); setSearchOpen(false); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await client.get(`/users/search?q=${encodeURIComponent(val)}`)
        setSearchResults(data)
        setSearchOpen(data.length > 0)
      } catch { setSearchResults([]) }
    }, 300)
  }

  const selectUser = (email) => {
    setInviteEmail(email)
    setSearchResults([])
    setSearchOpen(false)
  }

  const sendInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    try {
      const { data } = await client.post(`/trips/${trip.id}/invite`, { email: inviteEmail.trim() })
      setInviteUrl(data.invite_url)
      setInviteEmail('')
      setSearchResults([])
      setSearchOpen(false)
    } catch (err) {
      setInviteError(err.response?.data?.detail || 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {}
  }

  const isOrganizer = user?.id === trip?.organizer_id
  const members = trip?.members?.filter(m => m.joined === 'joined') ?? []
  const pending = trip?.members?.filter(m => m.joined !== 'joined') ?? []
  const nonResponderCount = members.filter(m => m.user_id && !respondedIds.has(m.user_id)).length

  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        WHO'S IN ({members.length})
      </div>
      {members.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13 }}>
          <span>{respondedIds.has(m.user_id) ? '✅' : '⏳'}</span>
          <span>{m.invite_email ?? `Member ${m.user_id}`}</span>
        </div>
      ))}
      {pending.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 4 }}>
          {pending.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>📨</span>
              <span>{m.invite_email ?? 'Pending'}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {isOrganizer && openPhase === 'availability' && nonResponderCount > 0 && (
          <button
            onClick={nudge}
            disabled={nudging}
            style={{ fontSize: 12, padding: '4px 10px' }}
            className="btn-ghost"
          >
            {nudging ? 'Sending...' : `Nudge ${nonResponderCount} non-responder${nonResponderCount !== 1 ? 's' : ''}`}
          </button>
        )}

        {isOrganizer && (
          <button
            onClick={() => {
              if (!showInvite) {
                client.get(`/trips/${trip.id}/past-golfers`).then(r => setPastGolfers(r.data)).catch(() => {})
              }
              setShowInvite(!showInvite)
              setInviteUrl('')
              setInviteError(null)
            }}
            style={{ fontSize: 12, padding: '4px 10px' }}
            className="btn-ghost"
          >
            {showInvite ? 'Cancel' : '+ Invite'}
          </button>
        )}
      </div>

      {showInvite && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#1a1a1a', borderRadius: 8, border: '1px solid #2a2a2a' }}>
          {pastGolfers.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Recent golfers:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {pastGolfers.map(email => (
                  <button
                    key={email}
                    type="button"
                    className="btn-ghost"
                    onClick={() => selectUser(email)}
                    style={{ fontSize: 11, padding: '2px 7px' }}
                  >
                    {email}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={sendInvite}>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => onEmailChange(e.target.value)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                  placeholder="email or search name..."
                  required
                  style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                />
                <button type="submit" className="btn-primary" disabled={inviting} style={{ fontSize: 12, padding: '5px 10px' }}>
                  {inviting ? '...' : 'Invite'}
                </button>
              </div>
              {/* Live user search dropdown */}
              {searchOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: '#242424', border: '1px solid #3a3a3a', borderRadius: 6,
                  marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}>
                  {searchResults.map(u => (
                    <div
                      key={u.id}
                      onMouseDown={() => selectUser(u.email)}
                      style={{
                        padding: '7px 10px', cursor: 'pointer', fontSize: 12,
                        borderBottom: '1px solid #2a2a2a',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <span style={{ color: '#fff' }}>{u.name}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{u.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {inviteError && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>{inviteError}</div>
            )}
          </form>
          {inviteUrl && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                Invite link (share if they haven't signed up yet):
              </div>
              <button
                onClick={copyInvite}
                className="btn-ghost"
                style={{ width: '100%', fontSize: 11, padding: '4px 8px' }}
              >
                {inviteCopied ? '✓ Copied!' : 'Copy Invite Link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
