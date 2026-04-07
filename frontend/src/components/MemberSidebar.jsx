import { useState } from 'react'
import client from '../api/client'

export default function MemberSidebar({ trip, onInviteSent }) {
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const sendInvite = async (e) => {
    e.preventDefault()
    const { data } = await client.post(`/trips/${trip.id}/invite`, { email })
    setInviteUrl(data.invite_url)
    setEmail('')
    if (onInviteSent) onInviteSent()
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const joined = trip.members.filter((m) => m.joined === 'joined')
  const pending = trip.members.filter((m) => m.joined === 'pending')

  const COLORS = ['#2b6cb0', '#553c9a', '#285e61', '#744210', '#276749', '#c05621']

  return (
    <div style={{ width: 220, padding: 16, background: '#0f1923', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
      <div className="label" style={{ marginBottom: 12 }}>Group Members</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {trip.members.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: COLORS[i % COLORS.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {(m.invite_email || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{m.invite_email || 'Pending'}</div>
              <div style={{ fontSize: 10, color: m.joined === 'joined' ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                {m.joined === 'joined' ? '✓ Joined' : '⏳ Pending'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendInvite} style={{ marginBottom: 12 }}>
        <div className="label">Invite by Email</div>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@email.com" required style={{ marginBottom: 6 }}
        />
        <button type="submit" className="btn-primary" style={{ width: '100%', fontSize: 12 }}>Send Invite</button>
      </form>

      {inviteUrl && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>Share this link:</div>
          <div style={{ fontSize: 10, color: 'var(--accent-blue)', wordBreak: 'break-all', marginBottom: 6 }}>{inviteUrl}</div>
          <button className="btn-ghost" onClick={copyLink} style={{ width: '100%', fontSize: 11 }}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 12, background: 'var(--bg-card)', borderRadius: 6, padding: 8, textAlign: 'center', fontSize: 11 }}>
        <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{joined.length}</span>
        <span style={{ color: 'var(--text-secondary)' }}> / {trip.members.length} responded</span>
      </div>
    </div>
  )
}
