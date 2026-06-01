import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/auth'
import { useTripStore } from '../store/trip'
import client from '../api/client'

function emailToName(email) {
  if (!email) return 'Unknown'
  return email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtNudge(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MemberPanel({ trip }) {
  const user = useAuthStore(s => s.user)
  const phases = useTripStore(s => s.phases)
  const refreshKey = useTripStore(s => s.refreshKey)
  const loadTrip = useTripStore(s => s.loadTrip)
  const openPhase = phases.find(p => p.status === 'open')?.phase ?? null
  const [availability, setAvailability] = useState(null)
  const [nudging, setNudging] = useState({})
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [pastGolfers, setPastGolfers] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingHandicap, setEditingHandicap] = useState(false)
  const [handicapStr, setHandicapStr] = useState('')
  const searchTimer = useRef(null)

  // F6 — re-fetch when refreshKey bumps (after availability submit)
  useEffect(() => {
    if (!trip) return
    client.get(`/trips/${trip.id}/availability`)
      .then(r => setAvailability(r.data))
      .catch(() => {})
  }, [trip?.id, refreshKey])

  const respondedIds = new Set(availability?.responded_user_ids ?? [])
  const isOrganizer = user?.id === trip?.organizer_id
  const members = trip?.members?.filter(m => m.joined === 'joined') ?? []
  const pending = trip?.members?.filter(m => m.joined !== 'joined') ?? []
  const nonResponders = members.filter(m => m.user_id && !respondedIds.has(m.user_id))

  const nudge = async (userId) => {
    setNudging(n => ({ ...n, [userId]: true }))
    try {
      await client.post(`/trips/${trip.id}/nudge/${userId}`)
    } catch { } finally {
      setNudging(n => { const next = { ...n }; delete next[userId]; return next })
    }
  }

  const saveHandicap = async () => {
    const val = handicapStr.trim() === '' ? null : parseFloat(handicapStr)
    try {
      await client.patch(`/trips/${trip.id}/members/handicap`, { handicap: val })
      setEditingHandicap(false)
      loadTrip(trip.id)
    } catch { }
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
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) return
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
    } catch { }
  }

  return (
    <div style={{ minWidth: 180, maxWidth: 260 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        WHO'S IN ({members.length})
      </div>

      {members.map(m => {
        const isMe = m.user_id === user?.id
        const responded = respondedIds.has(m.user_id)
        const name = emailToName(m.invite_email)
        const hcp = m.handicap != null ? `HCP ${m.handicap}` : null
        const nudgedAgo = fmtNudge(m.last_nudged_at)

        return (
          <div key={m.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span title={responded ? 'Responded' : 'Pending'}>{responded ? '✅' : '⏳'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
                {isMe && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> (you)</span>}
              </span>
              {hcp && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{hcp}</span>}
            </div>

            {isMe && (
              <div style={{ marginLeft: 20, marginTop: 2 }}>
                {!editingHandicap ? (
                  <button className="btn-ghost" onClick={() => { setHandicapStr(m.handicap?.toString() ?? ''); setEditingHandicap(true) }}
                    style={{ fontSize: 12, padding: '1px 6px', color: '#888' }}>
                    {m.handicap != null ? `✏️ Edit HCP` : '+ Add HCP'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="number" value={handicapStr} onChange={e => setHandicapStr(e.target.value)}
                      placeholder="e.g. 14.2" step="0.1"
                      style={{ width: 70, fontSize: 12, padding: '2px 6px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 4, color: '#fff' }}
                      autoFocus />
                    <button className="btn-primary" onClick={saveHandicap} style={{ fontSize: 12, padding: '2px 6px' }}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditingHandicap(false)} style={{ fontSize: 12, padding: '2px 4px' }}>✕</button>
                  </div>
                )}
              </div>
            )}

            {isOrganizer && openPhase === 'availability' && !responded && m.user_id && m.user_id !== user?.id && (
              <div style={{ marginLeft: 20, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn-ghost" onClick={() => nudge(m.user_id)} disabled={nudging[m.user_id]}
                  style={{ fontSize: 12, padding: '1px 6px' }}>
                  {nudging[m.user_id] ? '...' : 'Nudge'}
                </button>
                {nudgedAgo && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>last {nudgedAgo}</span>}
              </div>
            )}
          </div>
        )
      })}

      {pending.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 4 }}>
          {pending.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>📨</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.invite_email ?? 'Pending'}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
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
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Recent golfers:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {pastGolfers.map(email => (
                  <button key={email} type="button" className="btn-ghost" onClick={() => selectUser(email)}
                    style={{ fontSize: 12, padding: '2px 7px' }}>
                    {email}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={sendInvite}>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={inviteEmail} onChange={e => onEmailChange(e.target.value)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                  placeholder="search name or type email..."
                  style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
                <button type="submit" className="btn-primary" disabled={inviting} style={{ fontSize: 12, padding: '5px 10px' }}>
                  {inviting ? '...' : 'Invite'}
                </button>
              </div>
              {searchOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: '#242424', border: '1px solid #3a3a3a', borderRadius: 6,
                  marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}>
                  {searchResults.map(u => (
                    <div key={u.id}
                      onPointerDown={(e) => { e.preventDefault(); selectUser(u.email) }}
                      style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #2a2a2a' }}
                      onPointerEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                      onPointerLeave={e => e.currentTarget.style.background = ''}>
                      <span style={{ color: '#fff' }}>{u.name}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{u.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {inviteError && <div style={{ fontSize: 12, color: '#f87171', marginTop: 5 }}>{inviteError}</div>}
          </form>
          {inviteUrl && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Share link (for people not yet signed up):
              </div>
              <button onClick={copyInvite} className="btn-ghost" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}>
                {inviteCopied ? '✓ Copied!' : 'Copy Invite Link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
