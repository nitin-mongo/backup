'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

export default function WhatIfTab({ data }: Props) {
  const { whatIfTotal: wi, monthly_totals: mt, clusters } = data;

  const wiClusters = clusters.filter(c => c.whatIf && c.whatIf.preAvgCCB > 500).slice(0, 15);

  const chartData = {
    labels: wiClusters.map(c => c.name),
    datasets: [
      { label: 'Hypothetical (old policy)', data: wiClusters.map(c => c.whatIf!.hypotheticalCCB), backgroundColor: 'rgba(248,81,73,.6)', borderColor: '#f85149', borderWidth: 1 },
      { label: 'Actual Current', data: wiClusters.map(c => c.whatIf!.actualTotal), backgroundColor: 'rgba(88,166,255,.6)', borderColor: '#58a6ff', borderWidth: 1 },
    ],
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Policy change */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>What Would Costs Be Without the Policy Change?</h3>
          <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 13 }}>If the old backup policy continued with no changes, backup storage would have grown with data.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <StatBox label="Pre-Opt Avg CCB">{fmt(wi.preAvgCCB)}</StatBox>
            <span style={{ color: 'var(--text2)', fontSize: 18 }}>×</span>
            <StatBox label="Data Growth">{wi.dataGrowth}×</StatBox>
            <span style={{ color: 'var(--text2)', fontSize: 18 }}>=</span>
            <StatBox label="Hypothetical Today"><span className="neg">{fmt(wi.hypotheticalCCB)}</span></StatBox>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 2 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Actual Current (CCB + Export)</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)' }}>{fmt(wi.actualTotal)}</div>
            </div>
          </div>
          <div style={{ background: 'rgba(63,185,80,.1)', border: '1px solid rgba(63,185,80,.3)', borderRadius: 8, padding: 16, textAlign: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>Est. Monthly Savings from Optimization</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{fmt(wi.savings)}</div>
          </div>
        </div>

        {/* Ratio reduction */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Snapshot Overhead Reduction</h3>
          <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 13 }}>The backup-to-data ratio directly shows backup overhead.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Pre-Opt Ratio</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{wi.backupRatioPre}×</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Backup storage per GB data</div>
            </div>
            <span style={{ color: 'var(--text2)', fontSize: 18 }}>→</span>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Post-Opt Ratio</div>
              <div style={{ fontSize: 18, fontWeight: 600 }} className="pos">{wi.backupRatioPost}×</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Backup storage per GB data</div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 16, background: 'var(--surface2)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>The customer&apos;s point is valid:</strong> Snapshot ratio dropped from <span className="warn">{wi.backupRatioPre}×</span> to <span className="pos">{wi.backupRatioPost}×</span>. At today&apos;s data (<span style={{ color: 'var(--text)' }}>{wi.junData.toLocaleString()}</span> GB), old ratio would be <span className="neg">{Math.round(wi.junData * wi.backupRatioPre).toLocaleString()}</span> GB backup vs actual <span className="pos">{wi.junBackupGB.toLocaleString()}</span> GB. But S3 export costs (<span className="warn">{fmt(mt['2026-06'].totalExport)}</span>/mo) partially offset CCB savings.
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Per-Cluster: Hypothetical vs Actual (Jun 2026)</div>
        <ChartWrapper type="bar" data={chartData} height={450} options={{
          indexAxis: 'y' as const,
          plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } }, legend: { position: 'bottom', labels: { boxWidth: 12 } } },
          scales: { x: { ticks: { callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } }, y: { grid: { display: false } } }
        } as any} />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Per-Cluster What-If Analysis</h3>
        </div>
        <div className="scr">
          <table>
            <thead><tr>
              <th>Cluster</th><th>Pre-Opt Avg CCB</th><th>Pre Data GB</th><th>Jun Data GB</th>
              <th>Growth</th><th>Hypothetical</th><th>Actual Total</th><th>Savings</th>
            </tr></thead>
            <tbody>
              {clusters.filter(c => c.whatIf).map(c => {
                const w = c.whatIf!;
                return (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{fmt(w.preAvgCCB)}</td>
                    <td>{Math.round(w.preAvgData).toLocaleString()}</td>
                    <td>{Math.round(w.junData).toLocaleString()}</td>
                    <td>{w.dataGrowth}×</td>
                    <td className="neg">{fmt(w.hypotheticalCCB)}</td>
                    <td style={{ color: 'var(--accent)' }}>{fmt(w.actualTotal)}</td>
                    <td className={w.savings >= 0 ? 'pos' : 'neg'}>{w.savings >= 0 ? '+' : ''}{fmt(w.savings)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{children}</div>
    </div>
  );
}
