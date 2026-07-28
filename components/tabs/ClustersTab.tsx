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

      {/* ── Cluster Deep Dive (only when a single cluster is selected) ── */}
      {cluster !== 'ALL' && (() => {
        const cl = clusters.find(x => x.name === cluster);
        if (!cl) return null;

        // Find latest full month with data for this cluster
        const latestMonth = [...months].reverse().find(
          m => !data.partialMonths.includes(m) && (cl.months[m]?.total || 0) > 0
        );
        if (!latestMonth) return null;

        const md = cl.months[latestMonth];
        const [y, mo] = latestMonth.split('-').map(Number);
        const days = new Date(y, mo, 0).getDate();

        // ── Storage calculation derivations ──
        const gbDays   = Math.round(md.avgBackupGB * days);          // total GB-days billed for CCB
        const gbHours  = Math.round(md.avgDataGB * days * 24);       // total GB-hours billed for storage
        const perNodeProvGB = Math.round(md.avgDataGB / 3);          // assumes 3-node replica set

        // ── Snapshot stack estimation ──
        // Full snapshot ≈ per-node-provisioned (not the 3× total)
        const fullSnapGB   = perNodeProvGB;
        const totalSnapGB  = md.avgBackupGB;
        const incrementalPerSnap = totalSnapGB > fullSnapGB
          ? Math.round((totalSnapGB - fullSnapGB) / Math.max((gbDays / days / fullSnapGB) * days - 1, 1))
          : 0;
        const estSnapshots = totalSnapGB > fullSnapGB && incrementalPerSnap > 0
          ? Math.round(1 + (totalSnapGB - fullSnapGB) / incrementalPerSnap)
          : 1;

        // ── CCB-Only vs CCB+Export comparison ──
        // Scenario A: CCB only, 10-day retention (no exports) — baseline
        const scenA_ccb   = md.ccb;
        const scenA_total = md.ccb; // no export in this scenario

        // Scenario B: CCB reduced to 3 days (~30% of 10d) + keep export uploads
        // Ratio: 3-day storage ≈ full + 11 incrementals vs 10-day = full + 39 incrementals
        const ccbRatio3d  = fullSnapGB + 11 * incrementalPerSnap > 0
          ? (fullSnapGB + 11 * incrementalPerSnap) / totalSnapGB
          : 0.30;
        const scenB_ccb   = Math.round(md.ccb * Math.min(ccbRatio3d, 0.40));
        const scenB_exp   = md.exportUpload;
        const scenB_total = scenB_ccb + scenB_exp;
        const savings     = scenA_total - scenB_total;
        const savingsPct  = Math.round((savings / scenA_total) * 100);

        // Tier waterfall items
        const tiers = [
          { label: 'Tier 1 (5–100 GB)',   cost: md.ccbTier1, color: '#58a6ff' },
          { label: 'Tier 2 (100–250 GB)', cost: md.ccbTier2, color: '#3fb950' },
          { label: 'Tier 3 (250–500 GB)', cost: md.ccbTier3, color: '#d29922' },
          { label: 'Tier 4 (>500 GB)',    cost: md.ccbTier4, color: '#f85149' },
        ].filter(t => t.cost > 0);

        const tierChartData = {
          labels: tiers.map(t => t.label),
          datasets: [{
            data: tiers.map(t => t.cost),
            backgroundColor: tiers.map(t => t.color + '99'),
            borderColor: tiers.map(t => t.color),
            borderWidth: 2,
          }],
        };

        const compLabels = ['CCB Only\n(10-day, no export)', 'CCB 3-day\n+ S3 Exports'];
        const compData = {
          labels: compLabels,
          datasets: [
            { label: 'CCB Cost',    data: [scenA_ccb, scenB_ccb],  backgroundColor: '#58a6ff99', borderColor: '#58a6ff', borderWidth: 2, stack: 's' },
            { label: 'Export Cost', data: [0,          scenB_exp],  backgroundColor: '#d2992299', borderColor: '#d29922', borderWidth: 2, stack: 's' },
          ],
        };

        return (
          <div style={{ marginBottom: 24 }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#0d2137,#162336)', border: '1px solid #1f4068', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                Cluster Deep Dive — {cluster}
              </h3>
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>
                Based on {latestMonth} invoice data · {days}-day month · All figures from Atlas invoice line items
              </p>
            </div>

            {/* ── Section 1: Storage Calculation Explained ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
                How Backup GB & Data GB Are Calculated
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Backup GB */}
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                    Backup GB · {md.avgBackupGB.toLocaleString()} GB/day avg
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
                    <strong style={{ color: 'var(--text)' }}>Source SKU:</strong> Continuous Cloud Backup Storage<br/>
                    <strong style={{ color: 'var(--text)' }}>Invoice unit:</strong> GB-days<br/>
                    <strong style={{ color: 'var(--text)' }}>Total GB-days billed:</strong> {gbDays.toLocaleString()} GB-days<br/>
                    <br/>
                    <span style={{ fontFamily: 'monospace', background: 'rgba(88,166,255,.1)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', fontSize: 11 }}>
                      {gbDays.toLocaleString()} GB-days ÷ {days} days = {md.avgBackupGB.toLocaleString()} GB
                    </span>
                    <br/><br/>
                    <strong style={{ color: 'var(--green)' }}>Based on:</strong> Actual EBS disk blocks written (AWS charges for data written, not allocated volume size)
                  </div>
                </div>

                {/* Data GB */}
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                    Data GB · {md.avgDataGB.toLocaleString()} GB/day avg
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
                    <strong style={{ color: 'var(--text)' }}>Source SKU:</strong> Standard Storage / Provisioned IOPS Storage<br/>
                    <strong style={{ color: 'var(--text)' }}>Invoice unit:</strong> GB-hours<br/>
                    <strong style={{ color: 'var(--text)' }}>Total GB-hours billed:</strong> {gbHours.toLocaleString()} GB-hrs<br/>
                    <br/>
                    <span style={{ fontFamily: 'monospace', background: 'rgba(210,153,34,.1)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', fontSize: 11 }}>
                      {gbHours.toLocaleString()} GB-hrs ÷ ({days}d × 24h) = {md.avgDataGB.toLocaleString()} GB
                    </span>
                    <br/><br/>
                    <strong style={{ color: 'var(--red)' }}>Based on:</strong> Provisioned (allocated) disk — not actual bytes used. Per-node ≈ {perNodeProvGB.toLocaleString()} GB.
                  </div>
                </div>
              </div>

              {/* Snapshot Stack */}
              <div style={{ marginTop: 16, background: 'rgba(88,166,255,.05)', border: '1px solid rgba(88,166,255,.15)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Snapshot Stack Estimate</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                  {[
                    { label: 'Avg Daily Snapshot Storage', val: md.avgBackupGB.toLocaleString() + ' GB' },
                    { label: 'Full Snapshot (1st)', val: fullSnapGB.toLocaleString() + ' GB' },
                    { label: 'Avg Incremental', val: incrementalPerSnap > 0 ? incrementalPerSnap.toLocaleString() + ' GB' : 'N/A' },
                    { label: 'Est. Retained Snapshots', val: estSnapshots + ' snapshots' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: 'var(--surface2)', borderRadius: 6, padding: 10 }}>
                      <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text2)' }}>
                  Note: Estimated from invoice GB-days. Verify exact count in Atlas → Cluster → Backup → Total Snapshots.
                </div>
              </div>
            </div>

            {/* ── Section 2: CCB Tier Breakdown ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>CCB Cost by Tier ({latestMonth})</h4>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
                  Atlas charges CCB in tiered GB/month rates. Tier 4 (&gt;500 GB) is the cheapest per GB but dominates at this scale.
                </p>
                <ChartWrapper type="bar" data={tierChartData} height={200} options={{
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.raw as number) } } },
                  scales: { y: { ticks: { callback: (v) => '$' + (Number(v)/1000).toFixed(0)+'K' }, grid: { color: '#21262d' } }, x: { grid: { display: false } } }
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                {tiers.map(t => (
                  <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${t.color}` }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{fmt(t.cost)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(88,166,255,.08)', borderRadius: 8, padding: '10px 14px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Total CCB</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{fmt(md.ccb)}</span>
                </div>
              </div>
            </div>

            {/* ── Section 3: CCB Only vs CCB + Export Strategy ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                CCB Only vs CCB + S3 Export — Which is Better?
              </h4>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.7 }}>
                Comparing keeping long CCB retention (no exports) against reducing CCB to 3 days and adding S3 exports for long-term recoverability.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* Scenario A */}
                <div style={{ background: 'rgba(248,81,73,.06)', border: '1px solid rgba(248,81,73,.25)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f85149', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Scenario A — CCB Only
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>10-day retention · No S3 exports · 2-day PITR oplog</div>
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <tbody>
                      <tr><td style={{ color: 'var(--text2)', paddingBottom: 6 }}>CCB cost (invoice)</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{fmt(scenA_ccb)}</td></tr>
                      <tr><td style={{ color: 'var(--text2)', paddingBottom: 6 }}>S3 export cost</td><td style={{ textAlign: 'right', color: 'var(--text2)' }}>—</td></tr>
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ color: 'var(--text)', fontWeight: 600, paddingTop: 8 }}>Monthly total</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#f85149', paddingTop: 8 }}>{fmt(scenA_total)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                    ⚠ Recoverability limited to <strong style={{ color: 'var(--text)' }}>10 days</strong>. No long-term archival.
                  </div>
                </div>

                {/* Scenario B */}
                <div style={{ background: 'rgba(63,185,80,.06)', border: '1px solid rgba(63,185,80,.25)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#3fb950', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Scenario B — CCB (3-day) + S3 Exports ✓
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>3-day CCB retention · Daily S3 exports · Unlimited long-term PITR</div>
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <tbody>
                      <tr><td style={{ color: 'var(--text2)', paddingBottom: 6 }}>CCB cost (est. ~30%)</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{fmt(scenB_ccb)}</td></tr>
                      <tr><td style={{ color: 'var(--text2)', paddingBottom: 6 }}>S3 export upload</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{fmt(scenB_exp)}</td></tr>
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ color: 'var(--text)', fontWeight: 600, paddingTop: 8 }}>Monthly total</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#3fb950', paddingTop: 8 }}>{fmt(scenB_total)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                    ✓ S3 snapshots retained as long as needed. Recovery possible from any export date.
                  </div>
                </div>
              </div>

              {/* Savings Banner */}
              <div style={{ background: savings > 0 ? 'rgba(63,185,80,.1)' : 'rgba(248,81,73,.1)', border: `1px solid ${savings > 0 ? 'rgba(63,185,80,.3)' : 'rgba(248,81,73,.3)'}`, borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Monthly Savings — Scenario B vs Scenario A</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: savings > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {savings > 0 ? '+' : ''}{fmt(savings)} / month
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: savings > 0 ? 'var(--green)' : 'var(--red)' }}>{savingsPct}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>cost reduction</div>
                </div>
              </div>

              {/* Chart */}
              <ChartWrapper type="bar" data={compData} height={220} options={{
                plugins: {
                  legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } },
                  tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } }
                },
                scales: {
                  y: { ticks: { callback: (v) => '$' + (Number(v)/1000).toFixed(0)+'K' }, grid: { color: '#21262d' } },
                  x: { grid: { display: false } }
                }
              }} />

              {/* Key Insight */}
              <div style={{ marginTop: 16, background: 'var(--surface2)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--text)' }}>Key Insight: </strong>
                S3 storage costs {fmt(md.exportUpload)}/month to upload but exports are incremental — once a snapshot is in S3, the per-GB/month AWS storage cost is ~$0.023/GB vs Atlas CCB Tier 4 at ~$0.25–$0.40/GB/month.
                That&apos;s a <strong style={{ color: 'var(--green)' }}>10–17× storage cost reduction</strong> for long-term retention.
                Reducing Atlas CCB retention to 3 days covers operational PITR needs; S3 covers compliance and disaster recovery at a fraction of the cost.
              </div>
            </div>
          </div>
        );
      })()}

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
