'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt, monthLabel } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

const GRID_COLOR = '#21262d';
const yTickK = { callback: (v: number | string) => '$' + (Number(v) / 1000).toFixed(0) + 'K' };
const yTickKgb = { callback: (v: number | string) => (Number(v) / 1000).toFixed(0) + 'K' };

export default function OverviewTab({ data }: Props) {
  const { months, monthly_totals: mt, partialMonths } = data;
  const ml = months.map(monthLabel);

  const ga = (k: keyof typeof mt[string]) => months.map(m => (mt[m] as Record<string, number>)[k] || 0);

  const costTrendData = {
    labels: ml,
    datasets: [
      { label: 'CCB', data: ga('ccb'), backgroundColor: '#58a6ff', stack: 's' },
      { label: 'Cloud Backup', data: ga('cloudBackup'), backgroundColor: '#bc8cff', stack: 's' },
      { label: 'S3 Export', data: ga('totalExport'), backgroundColor: '#d29922', stack: 's' },
    ],
  };

  const storageTrendData = {
    labels: ml,
    datasets: [
      { label: 'Backup Storage', data: ga('avgBackupGB'), borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,.1)', fill: true, tension: 0.3 },
      { label: 'Provisioned Disk', data: ga('avgDataGB'), borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,.1)', fill: true, tension: 0.3 },
    ],
  };

  const ratioData = {
    labels: ml,
    datasets: [{
      label: 'Ratio',
      data: months.map(m => mt[m].avgDataGB > 0 ? +(mt[m].avgBackupGB / mt[m].avgDataGB).toFixed(2) : 0),
      borderColor: '#d29922', backgroundColor: 'rgba(210,153,34,.1)', fill: true, tension: 0.3, pointRadius: 4,
    }],
  };

  const ta = ga('total');
  const compositionData = {
    labels: ml,
    datasets: [
      { label: 'CCB %', data: months.map((m, i) => ta[i] > 0 ? mt[m].ccb / ta[i] * 100 : 0), backgroundColor: '#58a6ff', stack: 's' },
      { label: 'Cloud Backup %', data: months.map((m, i) => ta[i] > 0 ? mt[m].cloudBackup / ta[i] * 100 : 0), backgroundColor: '#bc8cff', stack: 's' },
      { label: 'S3 Export %', data: months.map((m, i) => ta[i] > 0 ? mt[m].totalExport / ta[i] * 100 : 0), backgroundColor: '#d29922', stack: 's' },
    ],
  };

  const legendBottom = { position: 'bottom' as const, labels: { boxWidth: 12 } };
  const gridX = { display: false };
  const gridY = { color: GRID_COLOR };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <Card title="Monthly Backup Cost Trend (Atlas Charges)">
          <ChartWrapper type="bar" data={costTrendData} options={{ plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } }, legend: legendBottom }, scales: { y: { ticks: yTickK, grid: gridY }, x: { grid: gridX } } }} />
        </Card>
        <Card title="Backup Storage vs Provisioned Disk (GB)">
          <ChartWrapper type="line" data={storageTrendData} options={{ plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + Math.round(c.raw as number).toLocaleString() + ' GB' } }, legend: legendBottom }, scales: { y: { ticks: yTickKgb, grid: gridY }, x: { grid: gridX } } }} />
        </Card>
        <Card title="Backup:Prov. Disk Ratio (Snapshot Overhead)">
          <ChartWrapper type="line" data={ratioData} options={{ plugins: { tooltip: { callbacks: { label: (c) => (c.raw as number).toFixed(2) + '× overhead' } }, legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Number(v).toFixed(1) + '×' }, grid: gridY }, x: { grid: gridX } } }} />
        </Card>
        <Card title="Cost Composition Over Time">
          <ChartWrapper type="bar" data={compositionData} options={{ plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + (c.raw as number).toFixed(1) + '%' } }, legend: legendBottom }, scales: { y: { max: 100, ticks: { callback: (v) => v + '%' }, grid: gridY }, x: { grid: gridX } } }} />
        </Card>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Monthly Totals — All Clusters</h3>
        </div>
        <div className="scr">
          <table>
            <thead>
              <tr>
                <th>Month</th><th>CCB</th><th>Cloud Backup</th><th>S3 Export</th>
                <th>Total</th><th>Backup GB</th><th>Prov. Disk GB ⁽¹⁾</th><th>Ratio ⁽¹⁾</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const t = mt[m];
                const r = t.avgDataGB > 0 ? (t.avgBackupGB / t.avgDataGB).toFixed(2) : '-';
                const partial = partialMonths.includes(m) ? ' *' : '';
                return (
                  <tr key={m}>
                    <td>{m}{partial}</td>
                    <td>{fmt(t.ccb)}</td>
                    <td>{fmt(t.cloudBackup)}</td>
                    <td>{fmt(t.totalExport)}</td>
                    <td><strong>{fmt(t.total)}</strong></td>
                    <td>{Math.round(t.avgBackupGB).toLocaleString()}</td>
                    <td>{Math.round(t.avgDataGB).toLocaleString()}</td>
                    <td>{r}×</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 20px 12px', fontSize: 11, color: 'var(--text2)' }}>
          ⁽¹⁾ <strong>Prov. Disk GB</strong> = provisioned (allocated) disk size across all nodes (from Standard Storage / IOPS SKU, billed in GB-hours). <strong>Ratio</strong> = Backup GB ÷ Prov. Disk GB. Note: actual disk Used Size is typically 20–30% lower than provisioned, so the real Backup:Used-Disk ratio is proportionally higher.
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>{title}</div>
      {children}
    </div>
  );
}
