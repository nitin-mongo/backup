'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt, fmtGB, monthLabel } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

export default function S3CostsTab({ data }: Props) {
  const { projection: P } = data;
  const S3 = P.s3Summary;
  const s3E = P.s3Estimates;
  const cs3 = P.clusterS3;

  const s3Months = Object.keys(s3E).filter(m => s3E[m].export_gb > 0).sort();

  const s3TrendData = {
    labels: s3Months.map(m => {
      const [y, mo] = m.split('-');
      return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'][+mo] + " '" + y.slice(2);
    }),
    datasets: [
      {
        label: 'Data Exported to S3 (GB)',
        data: s3Months.map(m => s3E[m].export_gb),
        backgroundColor: 'rgba(210,153,34,.5)', borderColor: '#d29922', borderWidth: 1,
        yAxisID: 'y', type: 'bar' as const,
      },
      {
        label: 'Est. S3 Storage Cost',
        data: s3Months.map(m => s3E[m].s3_cost),
        borderColor: '#f85149', backgroundColor: 'rgba(248,81,73,.1)', fill: true, tension: 0.3,
        yAxisID: 'y1', type: 'line' as const, pointRadius: 4,
      },
      {
        label: 'Atlas Export Charges',
        data: s3Months.map(m => s3E[m].atlas_export_cost),
        borderColor: '#58a6ff', tension: 0.3, yAxisID: 'y1', type: 'line' as const, pointRadius: 4,
      },
    ],
  };

  let s3Tot = { gb: 0, s3s: 0, atlas: 0, s3c: 0 };
  cs3.forEach(c => { s3Tot.gb += c.exportGB; s3Tot.s3s += c.s3StoredGB; s3Tot.atlas += c.atlasExportCost; s3Tot.s3c += c.s3Cost; });

  // Waterfall
  const wfVals = [P.june.ccb, P.june.cloudBackup, P.june.totalExport, S3.junS3Cost];
  const wfTotal = wfVals.reduce((a, b) => a + b, 0);
  let running = 0;
  const wfBase: number[] = [], wfBar: number[] = [];
  wfVals.forEach(v => { wfBase.push(running); wfBar.push(v); running += v; });
  wfBase.push(0); wfBar.push(wfTotal);

  const waterfallData = {
    labels: ['Atlas CCB', 'Cloud Backup', 'S3 Export\n(Atlas)', 'AWS S3\nStorage', 'Total'],
    datasets: [
      { label: 'Base', data: wfBase, backgroundColor: 'transparent', borderWidth: 0, stack: 's' },
      { label: 'Cost', data: wfBar, backgroundColor: ['#58a6ff', '#bc8cff', '#d29922', '#f85149', '#3fb950'], stack: 's' },
    ],
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <Card title="Estimated AWS S3 Storage Charges" sub="These charges appear on the AWS bill, not the Atlas invoice. Based on S3 Standard pricing for Mumbai (ap-south-1) with 30-day retention of daily exports.">
          <div style={{ marginTop: 12 }}>
            {[
              { lb: 'June — Data Exported', vl: fmtGB(S3.junS3StoredGB) },
              { lb: 'June — Est. S3 Storage', vl: fmt(S3.junS3Cost) + '/mo', cls: 'warn' },
              { lb: 'July — Data Exported (proj)', vl: fmtGB(S3.julExportGBProj) },
              { lb: 'July — Est. S3 Storage', vl: fmt(S3.julS3Cost) + '/mo', cls: 'warn' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{item.lb}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: item.cls ? undefined : 'var(--text)' }} className={item.cls || ''}>{item.vl}</div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: 16, background: 'var(--surface2)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                With daily exports of ~10.5 TB across 27 clusters and 30-day retention, approximately <strong style={{ color: 'var(--text)' }}>{fmtGB(S3.junS3StoredGB)}</strong> sits in S3 at any given time. At S3 Standard rates this costs <strong className="warn">{fmt(S3.junS3Cost)}/month</strong> on the AWS bill.
              </p>
            </div>
          </div>
        </Card>

        <Card title="S3 Cost Model" sub="Pricing tiers for S3 Standard in ap-south-1:">
          <div style={{ marginTop: 12 }}>
            {[
              { lb: 'First 50 TB', vl: '$0.025/GB/month' },
              { lb: 'Next 450 TB', vl: '$0.024/GB/month' },
              { lb: 'Over 500 TB', vl: '$0.023/GB/month' },
            ].map((tier, i) => (
              <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{tier.lb}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{tier.vl}</div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: 12, background: 'rgba(210,153,34,.1)', border: '1px solid rgba(210,153,34,.3)', borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--orange)' }}>⚠ These are estimates. Actual S3 costs depend on retention policy, lifecycle rules, storage class, and request charges. PUT request charges for daily exports add roughly $50–100/mo additional.</p>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>S3 Export Volume & Estimated S3 Storage Cost by Month</div>
        <ChartWrapper type="bar" data={s3TrendData as any} height={380} options={{
          plugins: {
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + (c.datasetIndex === 0 ? Math.round(c.raw as number).toLocaleString() + ' GB' : fmt(c.raw as number)) } },
            legend: { position: 'bottom', labels: { boxWidth: 12 } }
          },
          scales: {
            y: { position: 'left', title: { display: true, text: 'GB Exported' }, ticks: { callback: (v) => (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } },
            y1: { position: 'right', title: { display: true, text: 'Cost ($)' }, ticks: { callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { display: false } },
            x: { grid: { display: false } }
          }
        } as any} />
      </div>

      {/* Per-cluster S3 table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Per-Cluster S3 Charges (June 2026)</h3>
        </div>
        <div className="scr">
          <table>
            <thead><tr>
              <th>Cluster</th><th>Export GB/mo</th><th>Export Days</th>
              <th>Avg/Day GB</th><th>S3 Stored (est.)</th>
              <th>Atlas Export Cost</th><th>AWS S3 Cost (est.)</th><th>Total</th>
            </tr></thead>
            <tbody>
              {cs3.map(c => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{Math.round(c.exportGB).toLocaleString()}</td>
                  <td>{c.exportDays}</td>
                  <td>{Math.round(c.dailyAvgGB).toLocaleString()}</td>
                  <td>{Math.round(c.s3StoredGB).toLocaleString()}</td>
                  <td>{fmt(c.atlasExportCost)}</td>
                  <td className="warn">{fmt(c.s3Cost)}</td>
                  <td>{fmt(c.atlasExportCost + c.s3Cost)}</td>
                </tr>
              ))}
              <tr className="totals-row">
                <td>TOTAL</td>
                <td>{Math.round(s3Tot.gb).toLocaleString()}</td><td></td><td></td>
                <td>{Math.round(s3Tot.s3s).toLocaleString()}</td>
                <td>{fmt(s3Tot.atlas)}</td>
                <td className="warn">{fmt(S3.junS3Cost)}</td>
                <td>{fmt(s3Tot.atlas + S3.junS3Cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Waterfall */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Complete Cost Waterfall: Atlas + AWS S3 (June 2026)</div>
        <ChartWrapper type="bar" data={waterfallData} height={380} options={{
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.datasetIndex === 1 ? fmt(c.raw as number) : '' } } },
          scales: { y: { ticks: { callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } }, x: { grid: { display: false } } }
        }} />
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: sub ? 8 : 16, color: 'var(--text)' }}>{title}</h3>
      {sub && <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 13 }}>{sub}</p>}
      {children}
    </div>
  );
}
