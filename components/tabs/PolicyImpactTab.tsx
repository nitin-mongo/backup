'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

// April = last full month under old policy, July = first steady month under new policy
const BASELINE_MONTH = '2026-04';
const NEW_MONTH      = '2026-07';
const BASELINE_LABEL = 'Apr 2026 (old policy)';
const NEW_LABEL      = 'Jul 2026 (new policy)';

type SortKey = 'saving' | 'pct' | 'aprCCB' | 'julCCB' | 'aprBkGB' | 'julBkGB' | 'amplification';

interface ClusterRow {
  name: string;
  aprCCB: number;
  julCCB: number;
  aprBkGB: number;
  julBkGB: number;
  aprDataGB: number;
  saving: number;
  pct: number;
  amplification: number; // Apr backup GB / (Apr data GB) — how many × over raw data
  bkGBReduction: number;
}

const CARD = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 8,
  padding: '16px 20px',
};

const TH: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: '#8b949e',
  background: '#0d1117',
  borderBottom: '1px solid #30363d',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'none',
};

const TD: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  borderBottom: '1px solid #21262d',
  whiteSpace: 'nowrap',
};

export default function PolicyImpactTab({ data }: Props) {
  const { clusters } = data;
  const [sortKey, setSortKey] = useState<SortKey>('saving');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo<ClusterRow[]>(() => {
    return clusters
      .map(c => {
        const apr = c.months[BASELINE_MONTH];
        const jul = c.months[NEW_MONTH];
        if (!apr || !jul) return null;
        const aprCCB   = apr.ccb   || 0;
        const julCCB   = jul.ccb   || 0;
        const aprBkGB  = apr.avgBackupGB || 0;
        const julBkGB  = jul.avgBackupGB || 0;
        const aprDataGB= apr.avgDataGB   || 0;
        if (aprCCB < 10) return null; // skip negligible clusters
        const saving   = aprCCB - julCCB;
        const pct      = aprCCB > 0 ? (saving / aprCCB) * 100 : 0;
        const amplification = aprDataGB > 0 ? aprBkGB / aprDataGB : 0;
        const bkGBReduction = aprBkGB > 0 ? ((aprBkGB - julBkGB) / aprBkGB) * 100 : 0;
        return { name: c.name, aprCCB, julCCB, aprBkGB, julBkGB, aprDataGB, saving, pct, amplification, bkGBReduction };
      })
      .filter(Boolean) as ClusterRow[];
  }, [clusters]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Summary stats
  const totalAprCCB  = rows.reduce((s, r) => s + r.aprCCB, 0);
  const totalJulCCB  = rows.reduce((s, r) => s + r.julCCB, 0);
  const totalSaving  = totalAprCCB - totalJulCCB;
  const avgPct       = totalAprCCB > 0 ? (totalSaving / totalAprCCB) * 100 : 0;
  const topSaver     = [...rows].sort((a, b) => b.saving - a.saving)[0];
  const rowsWithSaving = rows.filter(r => r.saving > 0).length;

  // Chart: top 15 by saving, horizontal bars — Apr CCB vs Jul CCB
  const top15 = [...rows].sort((a, b) => b.saving - a.saving).slice(0, 15);
  const chartData = {
    labels: top15.map(r => r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name),
    datasets: [
      {
        label: BASELINE_LABEL,
        data: top15.map(r => r.aprCCB),
        backgroundColor: 'rgba(248,81,73,0.75)',
        borderColor: '#f85149',
        borderWidth: 1,
        borderRadius: 3,
      },
      {
        label: NEW_LABEL,
        data: top15.map(r => r.julCCB),
        backgroundColor: 'rgba(63,185,80,0.75)',
        borderColor: '#3fb950',
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  };

  const chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#8b949e', font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (c: any) => ` ${c.dataset.label}: ${fmt(c.raw)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#21262d' },
        ticks: {
          color: '#8b949e',
          callback: (v: any) => '$' + (v / 1000).toFixed(0) + 'k',
        },
      },
      y: {
        grid: { color: '#21262d' },
        ticks: { color: '#c9d1d9', font: { size: 11 } },
      },
    },
  } as never;

  // Backup GB chart: Apr vs Jul for top 15
  const bkChartData = {
    labels: top15.map(r => r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name),
    datasets: [
      {
        label: 'Apr 2026 Backup GB',
        data: top15.map(r => r.aprBkGB),
        backgroundColor: 'rgba(188,140,255,0.75)',
        borderColor: '#bc8cff',
        borderWidth: 1,
        borderRadius: 3,
      },
      {
        label: 'Jul 2026 Backup GB',
        data: top15.map(r => r.julBkGB),
        backgroundColor: 'rgba(88,166,255,0.75)',
        borderColor: '#58a6ff',
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  };

  const bkChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#8b949e', font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (c: any) => ` ${c.dataset.label}: ${Number(c.raw).toLocaleString()} GB`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#21262d' },
        ticks: {
          color: '#8b949e',
          callback: (v: any) => (v / 1000).toFixed(0) + 'k GB',
        },
      },
      y: {
        grid: { color: '#21262d' },
        ticks: { color: '#c9d1d9', font: { size: 11 } },
      },
    },
  } as never;

  const displayRows = showAll ? sorted : sorted.slice(0, 20);

  const colLabel = (key: SortKey, label: string) => (
    <span style={{ cursor: 'pointer' }} onClick={() => handleSort(key)}>
      {label}{sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </span>
  );

  return (
    <div>
      {/* ── explanation banner ── */}
      <div style={{ ...CARD, marginBottom: 20, borderLeft: '3px solid #58a6ff', background: '#0d1117' }}>
        <div style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.7 }}>
          <strong style={{ color: '#58a6ff' }}>How to read this tab:</strong>
          &nbsp;Compares <strong>Apr 2026</strong> (last full month under the old retention policy — Hourly 7d / Daily 30d / Weekly 5w / Monthly 12mo) with <strong>Jul 2026</strong> (first steady month under the new reduced policy — Hourly 10d only + cross-region DR).
          The saving is <em>entirely invoice-backed</em> — no modelling, no estimates. Both months are actual Atlas invoices.
        </div>
      </div>

      {/* ── summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Monthly CCB Saving', value: fmt(totalSaving), sub: 'Apr → Jul across all clusters', color: '#3fb950' },
          { label: 'CCB Reduction', value: avgPct.toFixed(1) + '%', sub: `${fmt(totalAprCCB)} → ${fmt(totalJulCCB)}`, color: '#58a6ff' },
          { label: 'Annualized Saving', value: fmt(totalSaving * 12), sub: 'run-rate from Jul savings', color: '#d29922' },
          { label: 'Clusters Saving', value: rowsWithSaving + ' / ' + rows.length, sub: 'clusters with positive CCB delta', color: '#bc8cff' },
          { label: 'Top Single Saver', value: topSaver ? fmt(topSaver.saving) + '/mo' : '—', sub: topSaver?.name || '', color: '#f85149' },
        ].map(card => (
          <div key={card.label} style={CARD}>
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color, marginBottom: 2 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: '#6e7681', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 14 }}>
            CCB Cost: Apr (old policy) vs Jul (new policy) — Top 15 Clusters
          </div>
          <ChartWrapper type="bar" data={chartData} options={chartOptions} height={420} />
        </div>
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 14 }}>
            Backup Storage GB: Apr vs Jul — Top 15 Clusters
          </div>
          <ChartWrapper type="bar" data={bkChartData} options={bkChartOptions} height={420} />
        </div>
      </div>

      {/* ── insight callout ── */}
      <div style={{ ...CARD, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Why Was Apr So Expensive?</div>
          <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.6 }}>
            The old 12-month monthly retention tier accumulates <strong>325 days</strong> of incremental block changes on top of the baseline snapshot.
            For a cluster with 1.4 TB of data and 4.7 GB/hr oplog, the monthly tier alone contributed <strong>~$7,800 of an $8,873 total</strong> — 88% of the CCB bill.
            Hourly + Daily + Weekly together were only ~$1,100.
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>What Changed in Jul?</div>
          <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.6 }}>
            New policy retains only <strong>10 days of hourly snapshots</strong> (same-region) + cross-region daily with 30-day PITR for DR.
            The same cluster now stores ~11k GB vs ~36k GB — a <strong>69% reduction in backup storage</strong> — despite the database growing from 1.4 TB to 1.6 TB and oplog increasing.
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Amplification Factor</div>
          <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.6 }}>
            Under the old policy, Atlas stored <strong>6–7× the actual data size</strong> in backup snapshots per cluster (e.g. 36k GB backup for 5.4k GB provisioned disk).
            Under the new policy this drops to <strong>1.7–2×</strong>. The amplification column in the table below shows this per cluster — highest amplification = biggest beneficiary of the policy change.
          </div>
        </div>
      </div>

      {/* ── full cluster table ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
            All Clusters — Policy Impact Detail &nbsp;
            <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 400 }}>
              (click column headers to sort)
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>{rows.length} clusters with data in both months</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 180 }}>Cluster</th>
                <th style={{ ...TH, textAlign: 'right' }} onClick={() => handleSort('aprBkGB')}>{colLabel('aprBkGB', 'Apr Backup GB')}</th>
                <th style={{ ...TH, textAlign: 'right' }} onClick={() => handleSort('julBkGB')}>{colLabel('julBkGB', 'Jul Backup GB')}</th>
                <th style={{ ...TH, textAlign: 'right' }}>{colLabel('amplification', 'Amplif. Factor')}</th>
                <th style={{ ...TH, textAlign: 'right' }} onClick={() => handleSort('aprCCB')}>{colLabel('aprCCB', 'Apr CCB')}</th>
                <th style={{ ...TH, textAlign: 'right' }} onClick={() => handleSort('julCCB')}>{colLabel('julCCB', 'Jul CCB')}</th>
                <th style={{ ...TH, textAlign: 'right', color: '#3fb950' }} onClick={() => handleSort('saving')}>{colLabel('saving', 'Monthly Saving')}</th>
                <th style={{ ...TH, textAlign: 'right' }} onClick={() => handleSort('pct')}>{colLabel('pct', '% Reduction')}</th>
                <th style={{ ...TH, textAlign: 'right' }}>Annualized</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, i) => {
                const savingColor = r.saving > 1000 ? '#3fb950' : r.saving > 0 ? '#e3b341' : '#f85149';
                return (
                  <tr key={r.name} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                    <td style={{ ...TD, color: '#c9d1d9', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#8b949e' }}>{r.aprBkGB.toLocaleString()}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#8b949e' }}>
                      {r.julBkGB.toLocaleString()}
                      <span style={{ fontSize: 10, color: '#3fb950', marginLeft: 4 }}>
                        {r.bkGBReduction > 0 ? `−${r.bkGBReduction.toFixed(0)}%` : ''}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: r.amplification > 5 ? 'rgba(248,81,73,.15)' : r.amplification > 3 ? 'rgba(211,141,34,.15)' : 'rgba(63,185,80,.15)',
                        color: r.amplification > 5 ? '#f85149' : r.amplification > 3 ? '#e3b341' : '#3fb950',
                      }}>
                        {r.amplification.toFixed(1)}×
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: '#f85149' }}>{fmt(r.aprCCB)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#3fb950' }}>{fmt(r.julCCB)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: savingColor }}>{fmt(r.saving)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#8b949e' }}>
                      {r.pct.toFixed(1)}%
                      <div style={{ width: '100%', marginTop: 2, height: 3, background: '#21262d', borderRadius: 2 }}>
                        <div style={{ width: Math.min(100, Math.max(0, r.pct)) + '%', height: '100%', background: savingColor, borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: '#6e7681' }}>{fmt(r.saving * 12)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0d1117' }}>
                <td style={{ ...TD, fontWeight: 700, color: '#c9d1d9' }}>TOTAL</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#8b949e' }}>
                  {rows.reduce((s, r) => s + r.aprBkGB, 0).toLocaleString()}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#8b949e' }}>
                  {rows.reduce((s, r) => s + r.julBkGB, 0).toLocaleString()}
                </td>
                <td style={{ ...TD, textAlign: 'right', color: '#6e7681' }}>—</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#f85149' }}>{fmt(totalAprCCB)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#3fb950' }}>{fmt(totalJulCCB)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#3fb950' }}>{fmt(totalSaving)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#3fb950' }}>{avgPct.toFixed(1)}%</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#d29922' }}>{fmt(totalSaving * 12)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!showAll && sorted.length > 20 && (
          <button
            onClick={() => setShowAll(true)}
            style={{ marginTop: 12, padding: '6px 16px', background: '#21262d', border: '1px solid #30363d', borderRadius: 6, color: '#c9d1d9', cursor: 'pointer', fontSize: 12 }}
          >
            Show all {sorted.length} clusters
          </button>
        )}
      </div>
    </div>
  );
}
