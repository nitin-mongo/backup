'use client';

import { useState } from 'react';
import { DashboardData } from '@/lib/types';
import TabNav from '@/components/TabNav';
import dynamic from 'next/dynamic';

const OverviewTab = dynamic(() => import('@/components/tabs/OverviewTab'), { ssr: false });
const ClustersTab = dynamic(() => import('@/components/tabs/ClustersTab'), { ssr: false });

type TabId = 'overview' | 'clusters';

interface Props {
  data: DashboardData;
  dbSource?: string;
}

export default function Dashboard({ data, dbSource }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: 24, background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      <div style={{ marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#e6edf3', letterSpacing: '-0.3px' }}>MongoDB Atlas Backup — Cost Optimisation Report</h1>
          <div style={{ color: '#8b949e', fontSize: 13 }}>
            Darwinbox &nbsp;·&nbsp; Jan 2025 – Jul 2026 &nbsp;·&nbsp; 30 clusters &nbsp;·&nbsp; Source: MongoDB Atlas Invoices
          </div>
        </div>
        {dbSource && dbSource !== 'static' && (
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: 'rgba(63,185,80,.15)', color: 'var(--green)', fontWeight: 600, letterSpacing: '.5px', alignSelf: 'center' }}>
            ✓ Live Data
          </span>
        )}
      </div>

      <TabNav active={activeTab} onChange={(tab) => setActiveTab(tab as TabId)} />

      {activeTab === 'overview' && <OverviewTab data={data} />}
      {activeTab === 'clusters' && <ClustersTab data={data} />}
    </div>
  );
}
