'use client';

import { useState } from 'react';
import { DashboardData } from '@/lib/types';
import { MONTH_NAMES } from '@/lib/formatters';
import TabNav from '@/components/TabNav';
import dynamic from 'next/dynamic';

const ExecutiveSummaryTab = dynamic(() => import('@/components/tabs/ExecutiveSummaryTab'), { ssr: false });
const OverviewTab      = dynamic(() => import('@/components/tabs/OverviewTab'), { ssr: false });
const ClustersTab      = dynamic(() => import('@/components/tabs/ClustersTab'), { ssr: false });
const ClusterAuditTab  = dynamic(() => import('@/components/tabs/ClusterAuditTab'), { ssr: false });

type TabId = 'executive' | 'overview' | 'clusters' | 'audit';

interface Props {
  data: DashboardData;
  dbSource?: string;
}

export default function Dashboard({ data, dbSource }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('executive');
  const [showSecondaryTabs, setShowSecondaryTabs] = useState(false);
  const toggleSecondaryTabs = () => {
    if (showSecondaryTabs && activeTab !== 'executive') setActiveTab('executive');
    setShowSecondaryTabs(!showSecondaryTabs);
  };
  const formatMonth = (month: string) => {
    const [year, monthNumber] = month.split('-');
    return `${MONTH_NAMES[Number(monthNumber)]} ${year}`;
  };
  const monthRange = data.months.length
    ? `${formatMonth(data.months[0])} – ${formatMonth(data.months[data.months.length - 1])}`
    : 'No invoice data';

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: 24, background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      <div style={{ marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#e6edf3', letterSpacing: '-0.3px' }}>MongoDB Atlas Backup Cost Analysis</h1>
          <div style={{ color: '#8b949e', fontSize: 13 }}>
            {monthRange} &nbsp;·&nbsp; {data.clusters.length} clusters &nbsp;·&nbsp; Source: MongoDB Atlas Invoices
          </div>
        </div>
        {dbSource && dbSource !== 'static' && (
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: 'rgba(63,185,80,.15)', color: 'var(--green)', fontWeight: 600, letterSpacing: '.5px', alignSelf: 'center' }}>
            ✓ Live Data
          </span>
        )}
      </div>

      <TabNav active={activeTab} onChange={(tab) => setActiveTab(tab as TabId)} showSecondaryTabs={showSecondaryTabs} />

      {activeTab === 'executive' && <ExecutiveSummaryTab data={data} />}
      {activeTab === 'overview'  && <OverviewTab      data={data} />}
      {activeTab === 'clusters'  && <ClustersTab      data={data} />}
      {activeTab === 'audit'     && <ClusterAuditTab  data={data} />}

      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <button
          type="button"
          aria-expanded={showSecondaryTabs}
          onClick={toggleSecondaryTabs}
          style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontSize: 11, padding: '6px 10px' }}
        >
          {showSecondaryTabs ? 'Hide other tabs' : 'Show other tabs'}
        </button>
      </div>
    </div>
  );
}
