'use client';

type TabId = 'overview' | 'projection' | 's3costs' | 'clusters' | 'whatif' | 'retention' | 'strategy' | 'discount' | 'valueproof' | 'upload';

interface TabNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; special?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projection', label: 'June vs July Projection' },
  { id: 's3costs', label: 'AWS S3 Charges' },
  { id: 'clusters', label: 'Per-Cluster Detail' },
  { id: 'whatif', label: 'Savings Analysis' },
  { id: 'retention', label: 'Retention & Export Scenarios' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'discount', label: '% Discount Analysis', special: true },
  { id: 'valueproof', label: '📊 Value Proof', special: true },
  { id: 'upload', label: '+ Add Invoices', special: true },
];

export default function TabNav({ active, onChange }: TabNavProps) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '1px solid var(--border)',
      marginBottom: 24,
      flexWrap: 'wrap'
    }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '10px 18px',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            borderBottom: active === tab.id
              ? `2px solid ${tab.special ? 'var(--green)' : 'var(--accent)'}`
              : '2px solid transparent',
            color: active === tab.id
              ? (tab.special ? 'var(--green)' : 'var(--accent)')
              : (tab.special ? 'var(--green)' : 'var(--text2)'),
            fontSize: 13,
            whiteSpace: 'nowrap',
            transition: 'all .2s',
            marginLeft: tab.special ? 'auto' : undefined,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
