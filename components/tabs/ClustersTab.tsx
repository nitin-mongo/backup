'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt, monthLabel } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39d353', '#e3b341', '#79c0ff'];

export default function ClustersTab({ data }: Props) {
  const { months, clusters, monthly_totals: mt } = data;
  const [cluster, setCluster] = useState('ALL');
  const [metric, setMetric] = useState<string>('total');
  const [sort, setSort] = useState('total_desc');

  const ml = months.map(monthLabel);
  const isGB = metric.includes('GB');

  let sorted = [...clusters];
  if (sort === 'total_desc') sorted.sort((a, b) => months.reduce((s, m) => s + ((b.months[m] as unknown as Record<string, number>)?.[metric] || 0), 0) - months.reduce((s, m) => s + ((a.months[m] as unknown as Record<string, number>)?.[metric] || 0), 0));
  else if (sort === 'growth_desc') sorted.sort((a, b) => (b.whatIf?.dataGrowth || 0) - (a.whatIf?.dataGrowth || 0));
  else if (sort === 'savings_desc') sorted.sort((a, b) => (b.whatIf?.savings || 0) - (a.whatIf?.savings || 0));

  let chartData;
  let chartTitle = '';

  if (cluster === 'ALL') {
    const top8 = sorted.slice(0, 8);
    chartTitle = 'Top 8 Clusters — ' + { total: 'Total Cost', ccb: 'CCB', totalExport: 'Export Cost', avgBackupGB: 'Backup Storage', avgDataGB: 'Data Size' }[metric];
    chartData = {
      labels: ml,
      datasets: top8.map((c, i) => ({
        label: c.name,
        data: months.map(m => (c.months[m] as unknown as Record<string, number>)?.[metric] || 0),
        borderColor: COLORS[i], tension: 0.3, pointRadius: 2,
      })),
    };
  } else {
    const c = clusters.find(x => x.name === cluster);
    chartTitle = cluster + ' — Breakdown';
    chartData = {
      labels: ml,
      datasets: c ? [
        { label: 'CCB', data: months.map(m => c.months[m]?.ccb || 0), backgroundColor: '#58a6ff', stack: 's' },
        { label: 'Cloud Backup', data: months.map(m => c.months[m]?.cloudBackup || 0), backgroundColor: '#bc8cff', stack: 's' },
        { label: 'S3 Export', data: months.map(m => c.months[m]?.totalExport || 0), backgroundColor: '#d29922', stack: 's' },
      ] : [],
    };
  }

  const displayClusters = cluster === 'ALL' ? sorted : clusters.filter(c => c.name === cluster);

  const ccbRow = months.map(m => clusters.reduce((s, c) => s + (c.months[m]?.ccb || 0), 0));
  const cbRow = months.map(m => clusters.reduce((s, c) => s + (c.months[m]?.cloudBackup || 0), 0));
  const exRow = months.map(m => clusters.reduce((s, c) => s + (c.months[m]?.totalExport || 0), 0));
  const totRow = months.map(m => clusters.reduce((s, c) => s + (c.months[m]?.total || 0), 0));

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          {
            label: 'Cluster', value: cluster, onChange: setCluster,
            options: [{ value: 'ALL', label: 'All Clusters' }, ...clusters.map(c => ({ value: c.name, label: c.name }))]
          },
          {
            label: 'Metric', value: metric, onChange: setMetric,
            options: [
              { value: 'total', label: 'Total Backup Cost' }, { value: 'ccb', label: 'CCB Cost Only' },
              { value: 'totalExport', label: 'Export Cost Only' }, { value: 'avgBackupGB', label: 'Backup Storage (GB)' },
              { value: 'avgDataGB', label: 'Data Size (GB)' },
            ]
          },
          {
            label: 'Sort', value: sort, onChange: setSort,
            options: [
              { value: 'total_desc', label: 'Total Cost (High→Low)' },
              { value: 'growth_desc', label: 'Data Growth (High→Low)' },
              { value: 'savings_desc', label: 'Est. Savings (High→Low)' },
            ]
          },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{f.label}</label>
            <select
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none' }}
            >
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>{chartTitle}</div>
        <ChartWrapper
          type={cluster === 'ALL' ? 'line' : 'bar'}
          data={chartData}
          height={400}
          options={{
            plugins: {
              tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + (isGB ? Math.round(c.raw as number).toLocaleString() + ' GB' : fmt(c.raw as number)) } },
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
            },
            scales: {
              y: { ticks: { callback: (v) => isGB ? (Number(v) / 1000).toFixed(0) + 'K' : '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } },
              x: { grid: { display: false } }
            }
          }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Per-Cluster Monthly Breakdown</h3>
        </div>
        <div className="scr" style={{ maxHeight: 700 }}>
          <table>
            <thead>
              <tr>
                <th>Cluster</th>
                {months.map(m => <th key={m}>{m.slice(2)}{data.partialMonths.includes(m) ? '*' : ''}</th>)}
                <th>13mo Total</th>
              </tr>
            </thead>
            <tbody>
              {displayClusters.map(c => {
                let rt = 0;
                return (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    {months.map(m => {
                      const v = (c.months[m] as unknown as Record<string, number>)?.[metric] || 0;
                      rt += v;
                      return <td key={m}>{v > 0 ? (isGB ? Math.round(v).toLocaleString() : fmt(v)) : '-'}</td>;
                    })}
                    <td><strong>{isGB ? Math.round(rt).toLocaleString() : fmt(rt)}</strong></td>
                  </tr>
                );
              })}
              {cluster === 'ALL' && <>
                <tr style={{ height: 8, background: 'var(--bg)' }}><td colSpan={months.length + 2}></td></tr>
                <tr style={{ background: 'rgba(88,166,255,.06)' }}>
                  <td style={{ color: 'var(--accent)' }}>↳ CCB Cost</td>
                  {ccbRow.map((v, i) => <td key={i}>{fmt(v)}</td>)}
                  <td><strong>{fmt(ccbRow.reduce((a, b) => a + b, 0))}</strong></td>
                </tr>
                <tr style={{ background: 'rgba(188,140,255,.06)' }}>
                  <td style={{ color: 'var(--purple)' }}>↳ Cloud Backup</td>
                  {cbRow.map((v, i) => <td key={i}>{v > 0 ? fmt(v) : '-'}</td>)}
                  <td><strong>{fmt(cbRow.reduce((a, b) => a + b, 0))}</strong></td>
                </tr>
                <tr style={{ background: 'rgba(210,153,34,.06)' }}>
                  <td style={{ color: 'var(--orange)' }}>↳ S3 Export (Atlas)</td>
                  {exRow.map((v, i) => <td key={i}>{v > 0 ? fmt(v) : '-'}</td>)}
                  <td><strong>{fmt(exRow.reduce((a, b) => a + b, 0))}</strong></td>
                </tr>
                <tr className="totals-row" style={{ fontSize: 14 }}>
                  <td>TOTAL BACKUP (Atlas)</td>
                  {totRow.map((v, i) => <td key={i}><strong>{fmt(v)}</strong></td>)}
                  <td style={{ fontSize: 15 }}><strong>{fmt(totRow.reduce((a, b) => a + b, 0))}</strong></td>
                </tr>
                <tr style={{ background: 'var(--surface2)' }}>
                  <td style={{ color: 'var(--text2)' }}>↳ MoM Change</td>
                  {totRow.map((v, i) => {
                    if (i === 0) return <td key={i}>—</td>;
                    const d = v - totRow[i - 1];
                    const p = totRow[i - 1] > 0 ? ((d / totRow[i - 1]) * 100).toFixed(0) : '—';
                    return <td key={i} style={{ color: d >= 0 ? 'var(--red)' : 'var(--green)' }}>{d >= 0 ? '+' : ''}{fmt(d)} ({p}%)</td>;
                  })}
                  <td></td>
                </tr>
              </>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
