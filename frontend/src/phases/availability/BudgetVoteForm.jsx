export default function BudgetVoteForm({ happySpend, hardLimit, onChange }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Budget (optional)</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>
        Only the organizer sees the group budget summary.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span>What would you happily spend? (per person)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>$</span>
            <input
              type="number" min="0" placeholder="e.g. 1500"
              value={happySpend}
              onChange={e => onChange({ happySpend: e.target.value, hardLimit })}
              style={{ width: 120 }}
            />
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span>What's your hard limit? (per person)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>$</span>
            <input
              type="number" min="0" placeholder="e.g. 2500"
              value={hardLimit}
              onChange={e => onChange({ happySpend, hardLimit: e.target.value })}
              style={{ width: 120 }}
            />
          </div>
        </label>
      </div>
    </div>
  )
}
