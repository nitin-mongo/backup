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

        // ── Section 3: Historical CCB Only vs CCB + Export ──
        const hasWhatIf = !!cl.whatIf;
        const clMonths  = months.filter(m => (cl.months[m]?.total || 0) > 0);

        // Hypothetical CCB per month: what would CCB have cost if exports were never introduced?
        // Uses preAvgCCB (old policy baseline) scaled by each month's data size growth.
        const hypotheticalByMonth = clMonths.map(m => {
          if (!hasWhatIf || !cl.whatIf!.preAvgData) return cl.months[m]?.ccb || 0;
          const mData = cl.months[m]?.avgDataGB || 0;
          return Math.round((cl.whatIf!.preAvgCCB * mData) / cl.whatIf!.preAvgData);
        });

        const actualCCBByMonth    = clMonths.map(m => cl.months[m]?.ccb          || 0);
        const actualExportByMonth = clMonths.map(m => cl.months[m]?.totalExport  || 0);
        const actualTotalByMonth  = clMonths.map((m, i) => actualCCBByMonth[i] + actualExportByMonth[i]);

        const totalHypothetical = hypotheticalByMonth.reduce((a, b) => a + b, 0);
        const totalActual       = actualTotalByMonth.reduce((a, b) => a + b, 0);
        const totalSavings      = totalHypothetical - totalActual;
        const totalSavingsPct   = totalHypothetical > 0 ? Math.round((totalSavings / totalHypothetical) * 100) : 0;

        // Latest full month delta
        const latestFullIdx   = clMonths.length >= 2 ? clMonths.length - 2 : clMonths.length - 1;
        const latestHypo      = hypotheticalByMonth[latestFullIdx] || 0;
        const latestActual    = actualTotalByMonth[latestFullIdx]  || 0;
        const latestSavings   = latestHypo - latestActual;

        const histChartData = {
          labels: clMonths.map(monthLabel),
          datasets: [
            {
              label: 'Hypothetical: CCB Only (no S3 exports)',
              data: hypotheticalByMonth,
              borderColor: '#f85149',
              backgroundColor: 'rgba(248,81,73,.08)',
              tension: 0.3,
              pointRadius: 3,
              fill: false,
            },
            {
              label: 'Actual: CCB + S3 Export (total)',
              data: actualTotalByMonth,
              borderColor: '#3fb950',
              backgroundColor: 'rgba(63,185,80,.12)',
              tension: 0.3,
              pointRadius: 3,
              fill: true,
            },
            {
              label: 'Actual: CCB alone',
              data: actualCCBByMonth,
              borderColor: '#58a6ff',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 2,
              borderDash: [4, 4],
              fill: false,
            },
          ],
        };

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

            {/* ── Section 3: Historical CCB Only vs CCB + Export ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                If S3 Exports Were Never Introduced — Month-by-Month (Jan 2025 → Latest)
              </h4>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.7 }}>
                The <span style={{ color: '#f85149', fontWeight: 600 }}>red line</span> shows what CCB alone would have cost each month if the old retention policy continued with no S3 exports (scaled by actual data growth per month).
                The <span style={{ color: '#3fb950', fontWeight: 600 }}>green area</span> is what was actually paid (CCB + Export combined).
                The gap is the value delivered by the export strategy.
              </p>

              {/* Summary stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Cumulative Hypothetical CCB', val: fmt(totalHypothetical), sub: 'if no exports (all months)', color: '#f85149' },
                  { label: 'Cumulative Actual (CCB + Export)', val: fmt(totalActual), sub: 'what was actually paid', color: '#3fb950' },
                  { label: 'Total Savings Delivered', val: fmt(totalSavings), sub: 'across all months', color: 'var(--green)', bold: true },
                  { label: 'Overall Cost Reduction', val: totalSavingsPct + '%', sub: 'vs hypothetical baseline', color: 'var(--green)', bold: true },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, borderTop: `3px solid ${s.color}` }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: s.bold ? 22 : 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Historical chart */}
              <ChartWrapper type="line" data={histChartData as never} height={300} options={{
                plugins: {
                  legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } },
                  tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } },
                },
                scales: {
                  y: { ticks: { callback: (v) => '$' + (Number(v)/1000).toFixed(0)+'K' }, grid: { color: '#21262d' } },
                  x: { grid: { display: false } },
                }
              } as never} />

              {/* Per-month breakdown table — last 8 months */}
              <div style={{ marginTop: 20, overflowX: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                  Month-by-Month Detail (last {Math.min(clMonths.length, 8)} months)
                </div>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Month', 'Hypothetical CCB', 'Actual CCB', 'Export Cost', 'Actual Total', 'Monthly Saving'].map(h => (
                        <th key={h} style={{ textAlign: h === 'Month' ? 'left' : 'right', paddingBottom: 8, color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clMonths.slice(-8).map((m, rawIdx) => {
                      const i      = clMonths.length - Math.min(clMonths.length, 8) + rawIdx;
                      const hypo   = hypotheticalByMonth[i] || 0;
                      const actCCB = actualCCBByMonth[i]    || 0;
                      const exp    = actualExportByMonth[i]  || 0;
                      const act    = actualTotalByMonth[i]   || 0;
                      const sav    = hypo - act;
                      return (
                        <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ paddingTop: 8, paddingBottom: 8, color: 'var(--text)', fontWeight: 500 }}>
                            {monthLabel(m)}{data.partialMonths.includes(m) ? ' *' : ''}
                          </td>
                          <td style={{ textAlign: 'right', color: '#f85149' }}>{fmt(hypo)}</td>
                          <td style={{ textAlign: 'right', color: '#58a6ff' }}>{fmt(actCCB)}</td>
                          <td style={{ textAlign: 'right', color: '#d29922' }}>{exp > 0 ? fmt(exp) : '—'}</td>
                          <td style={{ textAlign: 'right', color: '#3fb950', fontWeight: 600 }}>{fmt(act)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: sav >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {sav >= 0 ? '+' : ''}{fmt(sav)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ paddingTop: 10, fontWeight: 700, color: 'var(--text)' }}>All Months Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#f85149', paddingTop: 10 }}>{fmt(totalHypothetical)}</td>
                      <td colSpan={2}></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#3fb950', paddingTop: 10 }}>{fmt(totalActual)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: 'var(--green)', paddingTop: 10 }}>+{fmt(totalSavings)}</td>
                    </tr>
                  </tfoot>
                </table>
                {data.partialMonths.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>* Partial month — invoice not yet complete</div>
                )}
              </div>

              {/* Key Insight */}
              <div style={{ marginTop: 16, background: 'var(--surface2)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--text)' }}>Latest full month: </strong>
                Hypothetical CCB-only cost would have been <strong style={{ color: '#f85149' }}>{fmt(latestHypo)}</strong>.
                Actual paid (CCB + Exports) was <strong style={{ color: '#3fb950' }}>{fmt(latestActual)}</strong> — saving{' '}
                <strong style={{ color: 'var(--green)' }}>{fmt(latestSavings)}</strong> for this cluster in a single month.
                S3 archival costs ~$0.023/GB/month vs Atlas CCB Tier 4 at ~$0.25–$0.40/GB/month —
                a <strong style={{ color: 'var(--green)' }}>10–17× storage cost reduction</strong> for retention beyond 10 days.
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
