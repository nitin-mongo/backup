'use client';

import { useState } from 'react';
import { DashboardData } from '@/lib/types';
import InsightBanner from '@/components/InsightBanner';
import TabNav from '@/components/TabNav';
import dynamic from 'next/dynamic';

const OverviewTab = dynamic(() => import('@/components/tabs/OverviewTab'), { ssr: false });
const ProjectionTab = dynamic(() => import('@/components/tabs/ProjectionTab'), { ssr: false });
const S3CostsTab = dynamic(() => import('@/components/tabs/S3CostsTab'), { ssr: false });
const ClustersTab = dynamic(() => import('@/components/tabs/ClustersTab'), { ssr: false });
const WhatIfTab = dynamic(() => import('@/components/tabs/WhatIfTab'), { ssr: false });
const RetentionTab = dynamic(() => import('@/components/tabs/RetentionTab'), { ssr: false });
const StrategyTab = dynamic(() => import('@/components/tabs/StrategyTab'), { ssr: false });
const UploadTab = dynamic(() => import('@/components/tabs/UploadTab'), { ssr: false });

type TabId = 'overview' | 'projection' | 's3costs' | 'clusters' | 'whatif' | 'retention' | 'strategy' | 'upload';

interface Props {
  data: DashboardData;
  dbSource?: string;
}

export default function Dashboard({ data, dbSource }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: 24, background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      <div style={{ marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: '#e6edf3', letterSpacing: '-0.3px' }}>MongoDB Atlas Backup Cost Analysis</h1>
        <div style={{ color: '#aab4be', fontSize: 14, display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: '#aab4be' }}>Darwinbox — 18 months (Jan 2025 – Jul 2026) · 38 clusters · All backup-related charges incl. AWS S3 estimates</span>
          {dbSource && (
            <span style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              background: dbSource === 'static' ? 'rgba(210,153,34,.15)' : 'rgba(63,185,80,.15)',
              color: dbSource === 'static' ? 'var(--orange)' : 'var(--green)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
            }}>
              {dbSource === 'static' ? '⚠ Static Data' : dbSource === 'seeded' ? '✓ MongoDB Seeded' : '✓ MongoDB Atlas'}
            </span>
          )}
        </div>
      </div>

      <InsightBanner data={data} />

      <TabNav active={activeTab} onChange={(tab) => setActiveTab(tab as TabId)} />

      {activeTab === 'overview' && <OverviewTab data={data} />}
      {activeTab === 'projection' && <ProjectionTab data={data} />}
      {activeTab === 's3costs' && <S3CostsTab data={data} />}
      {activeTab === 'clusters' && <ClustersTab data={data} />}
      {activeTab === 'whatif' && <WhatIfTab data={data} />}
      {activeTab === 'retention' && <RetentionTab data={data} />}
      {activeTab === 'strategy' && <StrategyTab data={data} />}
      {activeTab === 'upload' && <UploadTab data={data} />}
    </div>
  );
}
