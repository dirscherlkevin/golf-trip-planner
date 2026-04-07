const STEPS = ['Availability', 'Location', 'Courses', 'Recommend']

export default function StepNav({ current }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
      {STEPS.map((label, i) => {
        const num = i + 1
        const isActive = num === current
        const isDone = num < current
        return (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px',
              fontSize: 12,
              fontWeight: isActive ? 700 : 400,
              color: isActive ? 'var(--step-active)' : isDone ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderBottom: isActive ? '2px solid var(--step-active)' : '2px solid transparent',
            }}
          >
            {isDone ? '✓ ' : `${num}. `}{label}
          </div>
        )
      })}
    </div>
  )
}
