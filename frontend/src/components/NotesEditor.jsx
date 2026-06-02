import { useState } from 'react'

export default function NotesEditor({ initialNotes, onSave, readOnly }) {
  const [text, setText] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(text.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { }
    finally { setSaving(false) }
  }

  if (readOnly) {
    if (!text) return null
    return (
      <div style={{ marginTop: 10, padding: '8px 10px', background: '#0d170d', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add notes..."
        rows={text ? Math.max(2, text.split('\n').length) : 2}
        style={{ width: '100%', padding: '6px 10px', background: '#0d170d', border: '1px solid #2a3a2a', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <button className="btn-ghost" disabled={saving} onClick={handleSave} style={{ fontSize: 11, padding: '2px 10px' }}>
          {saving ? '...' : 'Save notes'}
        </button>
        {saved && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
