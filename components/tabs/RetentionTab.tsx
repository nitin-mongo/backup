'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

const SC_KEYS = ['current', '7d_daily', '7d_weekly', '10d_weekly'] as const;

export default function RetentionTab({ data }: Props) {
  const SC = data.scenarios;
  const current = SC['current'];

  const retChartData = {
    labels: ['Current\n10d + Daily S3', '7d Retention\n+ Daily S3', '7d Retention\n+ Weekly S3', '10d Retention\n+ Weekly S3'],
    datasets: [{
      data: SC_KEYS.map(k => SC[k].fullyLoaded),
      backgroundColor: ['#58a6ff99', '#d2992299', '#3fb95099', '#39d35399'],
      borderColor: ['#58a6ff', '#d29922', '#3fb950', '#39d353'],
      borderWidth: 2,
    }],
  };

  const retStackData = {
    labels: ['Current\n10d + Daily S3', '7d Retention\n+ Daily S3', '7d Retention\n+ Weekly S3', '10d Retention\n+ Weekly S3'],
    datasets: [
      { label: 'Atlas CCB', data: SC_KEYS.map(k => SC[k].ccb), backgroundColor: '#58a6ff', stack: 's' },
      { label: 'Cloud Backup', data: SC_KEYS.map(k => SC[k].cloudBackup), backgroundColor: '#bc8cff', stack: 's' },
      { label: 'Atlas Export', data: SC_KEYS.map(k => SC[k].atlasExport), backgroundColor: '#d29922', stack: 's' },
      { label: 'AWS S3 Storage', data: SC_KEYS.map(k => SC[k].s3Cost), backgroundColor: '#f85149', stack: 's' },
    ],
  };

  // Waterfall: Current → 7d + Weekly
  const wf7w = SC['7d_weekly'];
  const wfSteps = [
    { label: 'Current\nFully Loaded', value: current.fullyLoaded, type: 'total' },
    { label: 'CCB Reduction\n(10d→7d)', value: -(current.ccb - wf7w.ccb), type: 'delta' },
    { label: 'Export Reduction\n(Daily→Weekly)', value: -(current.atlasExport - wf7w.atlasExport), type: 'delta' },
    { label: 'S3 Storage\nReduction', value: -(current.s3Cost - wf7w.s3Cost), type: 'delta' },
    { label: 'New Fully\nLoaded Total', value: wf7w.fullyLoaded, type: 'total' },
  ];

  const wfBase2: number[] = [], wfBar2: number[] = [], wfColors2: string[] = [];
  let running2 = current.fullyLoaded;
  wfSteps.forEach((step, i) => {
    if (step.type === 'total') {
      wfBase2.push(0); wfBar2.push(step.value);
      wfColors2.push(i === 0 ? '#58a6ff' : '#3fb950');
    } else {
      running2 += step.value;
      wfBase2.push(running2); wfBar2.push(Math.abs(step.value));
      wfColors2.push('#3fb950');
    }
  });

  const waterfallData = {
    labels: wfSteps.map(s => s.label),
    datasets: [
      { label: 'Base', data: wfBase2, backgroundColor: 'transparent', borderWidth: 0, stack: 's' },
      { label: 'Amount', data: wfBar2, backgroundColor: wfColors2, borderColor: wfColors2, borderWidth: 1, stack: 's' },
    ],
  };

  const tickK = { callback: (v: number | string) => '$' + (Number(v) / 1000).toFixed(0) + 'K' };

  return (
    <div>
      {/* Comparison Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Impact of Changing Retention & Export Frequency</h3>
        <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
          Comparing four configurations: current (10-day retention + daily S3), reduced retention to 7 days, weekly S3 exports, and combinations. All numbers are monthly estimates based on June 2026 actuals.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th style={{ textAlign: 'left' }}>Scenario</th>
              <th>Atlas CCB</th><th>Atlas Export</th><th>Atlas Subtotal</th>
              <th>S3 Stored</th><th>AWS S3 Cost</th><th>Fully Loaded</th><th>Δ vs Current</th><th>Annual Savings</th>
            </tr></thead>
            <tbody>
              {SC_KEYS.map(k => {
                const s = SC[k];
                const delta = s.fullyLoaded - current.fullyLoaded;
                const annual = delta * 12;
                const isBase = k === 'current', isBest = k === '7d_weekly';
                return (
                  <tr key={k} style={isBest ? { background: 'rgba(63,185,80,.08)' } : isBase ? { background: 'var(--surface2)', fontWeight: 600 } : {}}>
                    <td>{s.label}{isBest ? ' ⭐' : ''}</td>
                    <td>{fmt(s.ccb)}</td>
                    <td>{fmt(s.atlasExport)}</td>
                    <td><strong>{fmt(s.atlasSubtotal)}</strong></td>
                    <td>{Math.round(s.s3StoredGB).toLocaleString()} GB</td>
                    <td className="warn">{fmt(s.s3Cost)}</td>
                    <td><strong>{fmt(s.fullyLoaded)}</strong></td>
                    <td style={{ color: delta <= 0 ? 'var(--green)' : 'var(--red)' }}>{isBase ? 'Baseline' : (delta >= 0 ? '+' : '') + fmt(delta)}</td>
                    <td style={{ color: delta <= 0 ? 'var(--green)' : 'var(--red)' }}>{isBase ? '—' : (annual >= 0 ? '+' : '') + fmt(annual)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">CCB Tier 4 scales proportionally with retention days. Tiers 1–3 (first 500 GB/cluster) held constant. S3 assumes Standard tier in Mumbai (ap-south-1).</p>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Fully Loaded Monthly Cost by Scenario</div>
          <ChartWrapper type="bar" data={retChartData} height={380} options={{ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.raw as number) + '/mo', afterLabel: (c) => { const d = (c.raw as number) - current.fullyLoaded; return d !== 0 ? (d > 0 ? '+' : '') + fmt(d) + ' vs current' : ''; } } } }, scales: { y: { ticks: tickK, grid: { color: '#21262d' }, beginAtZero: true }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } } } }} />
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Cost Composition Breakdown</div>
          <ChartWrapper type="bar" data={retStackData} height={380} options={{ plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } }, legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { ticks: tickK, grid: { color: '#21262d' }, stacked: true }, x: { grid: { display: false }, stacked: true, ticks: { font: { size: 10 }, maxRotation: 0 } } } }} />
        </div>
      </div>

      {/* Callout cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Reducing Retention: 10 Days → 7 Days</h3>
          <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
            Reducing continuous backup retention from 10 to 7 days cuts Tier 4 storage by ~30%. CCB drops from <strong style={{ color: 'var(--text)' }}>$57,981</strong> to <strong className="pos">$42,766</strong> — saving <strong className="pos">$15,215/mo</strong> on CCB alone.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>CCB Savings</div>
              <div style={{ fontSize: 18, fontWeight: 600 }} className="pos">-$15,215/mo</div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>RPO Impact</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--orange)' }}>10d → 7d window</div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}><strong style={{ color: 'var(--text)' }}>Trade-off:</strong> Recovery window shrinks from 10 to 7 days. Any recovery beyond 7 days must come from S3 snapshots. If most recoveries happen within a few days, this is a low-risk change.</p>
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Best Combo: 7-Day Retention + Weekly S3</h3>
          <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
            The highest-savings combination: fully loaded cost drops to <strong className="pos">$52,167</strong> — a <strong className="pos">$65,539/mo ($786K/year)</strong> reduction vs current.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Total Savings</div>
              <div style={{ fontSize: 18, fontWeight: 600 }} className="pos">-$65,539/mo</div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Annual Savings</div>
              <div style={{ fontSize: 18, fontWeight: 600 }} className="pos">~$786K/yr</div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: 'rgba(63,185,80,.08)', border: '1px solid rgba(63,185,80,.25)', borderRadius: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}><strong className="pos">Why this works:</strong> CCB at 7 days saves $15K. Weekly exports save $44K on Atlas + $6.5K on S3. The 7-day Atlas window still covers most operational recoveries.</p>
          </div>
        </div>
      </div>

      {/* Savings waterfall */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Savings Waterfall: Current → 7-Day + Weekly S3</div>
        <ChartWrapper type="bar" data={waterfallData} height={350} options={{
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { if (c.datasetIndex === 0) return ''; const step = wfSteps[c.dataIndex]; return step.type === 'total' ? fmt(step.value) : '-' + fmt(Math.abs(step.value)); } } } },
          scales: { y: { ticks: tickK, grid: { color: '#21262d' } }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } } }
        }} />
      </div>
    </div>
  );
}
