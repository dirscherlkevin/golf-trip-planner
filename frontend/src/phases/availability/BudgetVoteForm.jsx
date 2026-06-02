export default function BudgetVoteForm({ happySpend, hardLimit, noHardLimit, onChange, readOnly }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Budget (optional)</div>
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>Per person · rounds only (lodging ~$100/night assumed separately).</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Only the organizer sees the group budget summary.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span>What would you happily spend? (per person)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>$</span>
            <input
              type="number" min="0" placeholder="e.g. 1500"
              value={happySpend}
              onChange={e => onChange({ happySpend: e.target.value, hardLimit, noHardLimit })}
              readOnly={readOnly}
              style={{ width: 120, opacity: readOnly ? 0.7 : 1 }}
            />
          </div>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span>What's your hard limit? (per person)</span>
          {!noHardLimit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>$</span>
              <input
                type="number" min="0" placeholder="e.g. 2500"
                value={hardLimit}
                onChange={e => onChange({ happySpend, hardLimit: e.target.value, noHardLimit })}
                readOnly={readOnly}
                style={{ width: 120, opacity: readOnly ? 0.7 : 1 }}
              />
              {!readOnly && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onChange({ happySpend, hardLimit: '', noHardLimit: true })}
                  style={{ fontSize: 11, padding: '2px 8px', color: 'var(--text-muted)' }}
                >
                  No hard limit
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--accent-green)' }}>No hard limit</span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onChange({ happySpend, hardLimit: '', noHardLimit: false })}
                  style={{ fontSize: 11, padding: '2px 8px', color: 'var(--text-muted)' }}
                >
                  Set a limit
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
