'use client';

type TabId = 'executive' | 'overview' | 'clusters' | 'audit';

interface TabNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  showSecondaryTabs: boolean;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'executive', label: 'Executive Summary' },
  { id: 'overview', label: 'Detail Summary' },
  { id: 'clusters', label: 'Cluster Detail' },
  { id: 'audit', label: 'Old Policy Audit' },
];

export default function TabNav({ active, onChange, showSecondaryTabs }: TabNavProps) {
  const visibleTabs = showSecondaryTabs ? TABS : TABS.filter(tab => tab.id === 'executive');

  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '1px solid var(--border)',
      marginBottom: 24,
    }}>
      {visibleTabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '11px 24px',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === tab.id ? 'var(--accent)' : 'var(--text2)',
            fontSize: 13,
            fontWeight: active === tab.id ? 600 : 400,
            whiteSpace: 'nowrap',
            transition: 'all .2s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
