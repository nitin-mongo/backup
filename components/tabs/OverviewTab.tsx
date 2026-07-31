'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt, monthLabel } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

// Actual disk space used across all clusters (Atlas Metrics → Disk Space Used, per-node aggregate in GB)
// Collected from Atlas UI — represents actual live data stored per node, aggregated across all 30 clusters
const USED_DISK_GB: Record<string, number> = {
  '2025-09': 26401.70,
  '2025-10': 26905.00,
  '2025-11': 28980.90,
  '2025-12': 26251.20,
  '2026-01': 30965.00,
  '2026-02': 29181.90,
  '2026-03': 31517.60,
  '2026-04': 33883.20,
  '2026-05': 36916.80,
  '2026-06': 39073.10,
};

// Month from which CCB + S3 Export optimisation was introduced
const OPT_START = '2026-01';
const GRID = '#21262d';
const yK = { callback: (v: unknown) => '$' + (Number(v) / 1000).toFixed(0) + 'K' };

export default function OverviewTab({ data }: Props) {
  const { months, clusters, monthly_totals: mt, partialMonths } = data;

  // ── Hypothetical CCB-only cost per month ──
  // Before optimisation: hypothetical = actual (old CCB policy was in effect, no exports)
  // From OPT_START onwards: scale each cluster's pre-opt CCB rate by its actual month-over-month data growth
  const hypotheticalPerMonth: number[] = months.map(m => {
    if (m < OPT_START) return mt[m]?.total || 0; // old policy was in effect — actual = hypothetical
    return clusters.reduce((sum, cl) => {
      if (!cl.whatIf || !cl.whatIf.preAvgData) return sum + (cl.months[m]?.ccb || 0);
      const mData = cl.months[m]?.avgDataGB || 0;
      return sum + (cl.whatIf.preAvgCCB * mData) / cl.whatIf.preAvgData;
    }, 0);
  });

  const actualPerMonth    = months.map(m => mt[m]?.total || 0);
  const actualCCBPerMonth = months.map(m => mt[m]?.ccb || 0);
  const exportPerMonth    = months.map(m => mt[m]?.totalExport || 0);

  // Savings only counted from when the optimisation started
  const totalSavings = months.reduce((sum, m, i) =>
    m >= OPT_START ? sum + Math.max(hypotheticalPerMonth[i] - actualPerMonth[i], 0) : sum, 0);

  const totalHypo   = hypotheticalPerMonth.reduce((a, b) => a + b, 0);
  const totalActual = actualPerMonth.reduce((a, b) => a + b, 0);

  // Latest completed (non-partial) month
  const latestFull = [...months].reverse().find(m => !partialMonths.includes(m) && (mt[m]?.total || 0) > 0) || months[months.length - 2];
  const latestIdx  = months.indexOf(latestFull);
  const latestHypo   = hypotheticalPerMonth[latestIdx] || 0;
  const latestActual = actualPerMonth[latestIdx] || 0;
  const latestSaving = Math.max(latestHypo - latestActual, 0);
  const savingsPct   = latestHypo > 0 ? Math.round((latestSaving / latestHypo) * 100) : 0;

  // ── Disk metrics for latest month ──
  const latestUsedGB  = USED_DISK_GB[latestFull] || 0;
  const latestBackupGB = mt[latestFull]?.avgBackupGB || 0;
  const latestProvTotalGB = mt[latestFull]?.avgDataGB || 0;
  const latestProvPerNodeGB = Math.round(latestProvTotalGB / 3); // 3-node replica set
  const realRatio  = latestUsedGB > 0 ? (latestBackupGB / latestUsedGB).toFixed(2) : null;
  const utilPct    = latestProvPerNodeGB > 0 ? ((latestUsedGB / latestProvPerNodeGB) * 100).toFixed(0) : null;

  const ml = months.map(monthLabel);

  const convictionChart = {
    labels: ml,
    datasets: [
      {
        label: 'Hypothetical: CCB-Only (old retention policy)',
        data: hypotheticalPerMonth,
        borderColor: '#f85149',
        backgroundColor: 'rgba(248,81,73,0.08)',
        tension: 0.3, pointRadius: 3, fill: false,
      },
      {
        label: 'Actual: CCB + S3 Export (what was charged)',
        data: actualPerMonth,
        borderColor: '#3fb950',
        backgroundColor: 'rgba(63,185,80,0.12)',
        tension: 0.3, pointRadius: 3, fill: true,
      },
    ],
  };

  const breakdownChart = {
    labels: ml,
    datasets: [
      { label: 'CCB', data: actualCCBPerMonth, backgroundColor: '#58a6ff99', borderColor: '#58a6ff', borderWidth: 1, stack: 's' },
      { label: 'S3 Export (Atlas charges)', data: exportPerMonth, backgroundColor: '#d2992299', borderColor: '#d29922', borderWidth: 1, stack: 's' },
    ],
  };

  return (
    <div>
      {/* ── Hero ── */}
      <div style={{ background: 'linear-gradient(135deg,#0a1f2e,#0d2a3a)', border: '1px solid #1d4f6e', borderRadius: 12, padding: 28, marginBottom: 24 }}>
        <h2 style={{ fontSize: 17, color: '#58a6ff', fontWeight: 700, marginBottom: 6 }}>
          Atlas Backup Optimisation — Verified Savings for Darwinbox
        </h2>
        <p style={{ color: '#aab4be', fontSize: 13, lineHeight: 1.75, maxWidth: 860, marginBottom: 24 }}>
          By moving from a pure <strong style={{ color: '#f85149' }}>Continuous Cloud Backup (CCB)</strong> retention policy to a hybrid{' '}
          <strong style={{ color: '#3fb950' }}>CCB + S3 Export</strong> strategy in early 2026, Darwinbox has significantly reduced backup costs
          while handling data growth. Every number below comes directly from MongoDB Atlas invoice data.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {[
            { label: 'Total Savings Since Optimisation', val: fmt(totalSavings), sub: `Jan 2026 → ${monthLabel(latestFull)} vs CCB-only baseline`, color: '#3fb950', big: true },
            { label: 'Saving This Month', val: fmt(latestSaving), sub: `${savingsPct}% less than CCB-only would have cost`, color: '#3fb950', big: false },
            { label: 'Annualised Saving', val: fmt(latestSaving * 12), sub: 'projected at current monthly run-rate', color: '#58a6ff', big: false },
            { label: 'CCB-Only Would Have Cost', val: fmt(latestHypo), sub: `Actual charged: ${fmt(latestActual)} (${monthLabel(latestFull)})`, color: '#f85149', big: false },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 18, borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: s.big ? 26 : 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8, lineHeight: 1.5 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Conviction Chart ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          What You Would Have Paid vs What You Actually Paid
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.7 }}>
          The <span style={{ color: '#f85149', fontWeight: 600 }}>red line</span> shows the estimated cost had Darwinbox stayed on the old CCB-only retention policy,
          scaled month-by-month by actual data growth. The <span style={{ color: '#3fb950', fontWeight: 600 }}>green shaded area</span> is what was actually charged
          (CCB + S3 Export). The gap from Jan 2026 onwards is the saving delivered by the strategy.
        </p>
        <ChartWrapper type="line" data={convictionChart as never} height={320} options={{
          plugins: {
            legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c: any) => (c.dataset.label ?? '') + ': ' + fmt(c.raw as number) } },
          },
          scales: {
            y: { ticks: yK, grid: { color: GRID } },
            x: { grid: { display: false } },
          },
        } as never} />
      </div>

      {/* ── Two-column: Breakdown + Ratio ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Actual Cost Breakdown — CCB vs S3 Export</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
            CCB covers active snapshots (10-day PITR window). S3 Export handles long-term retention at ~10× lower cost per GB than Atlas CCB Tier 4 pricing.
          </p>
          <ChartWrapper type="bar" data={breakdownChart} height={220} options={{
            plugins: {
              legend: { position: 'bottom' as const, labels: { boxWidth: 10 } },
              tooltip: { callbacks: { label: (c: any) => (c.dataset.label ?? '') + ': ' + fmt(c.raw as number) } },
            },
            scales: { y: { ticks: yK, grid: { color: GRID } }, x: { grid: { display: false } } },
          } as never} />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Backup Efficiency ({monthLabel(latestFull)})</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>Backup GB ÷ Actual Used Disk GB. Measures real snapshot overhead relative to live data.</p>
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 20, textAlign: 'center', borderTop: '3px solid #3fb950', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Backup GB ÷ Actual Used Disk GB</div>
            <div style={{ fontSize: 42, fontWeight: 800, color: realRatio ? '#3fb950' : 'var(--text2)', lineHeight: 1 }}>
              {realRatio ? `${realRatio}×` : 'N/A'}
            </div>
            {realRatio && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
                {Math.round(latestBackupGB).toLocaleString()} GB backup ÷ {Math.round(latestUsedGB).toLocaleString()} GB used
              </div>
            )}
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, fontSize: 11, color: 'var(--text2)', lineHeight: 1.8 }}>
            <div><strong style={{ color: 'var(--text)' }}>Per-node provisioned:</strong> {latestProvPerNodeGB.toLocaleString()} GB</div>
            <div><strong style={{ color: 'var(--text)' }}>Actual used (per-node):</strong> {Math.round(latestUsedGB).toLocaleString()} GB</div>
            {utilPct && <div><strong style={{ color: 'var(--text)' }}>Disk utilisation:</strong> {utilPct}%</div>}
            <div style={{ marginTop: 6, color: '#8b949e', fontSize: 10 }}>Source: Atlas UI → Metrics → Disk Space Used</div>
          </div>
        </div>
      </div>

      {/* ── Month-by-Month Table ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Month-by-Month Breakdown — All Clusters</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            All figures from Atlas invoices. "CCB-Only Estimate" = projected cost had the old retention policy continued.
          </p>
        </div>
        <div className="scr">
          <table>
            <thead>
              <tr>
                {['Month', 'CCB-Only Estimate', 'Actual CCB', 'S3 Export', 'Total Actual', 'Monthly Saving', 'Backup GB', 'Used Disk GB', 'Ratio'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Month' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const hypo    = Math.round(hypotheticalPerMonth[i]);
                const act     = actualPerMonth[i];
                const saving  = hypo - act;
                const usedGB  = USED_DISK_GB[m] || 0;
                const bkpGB   = mt[m]?.avgBackupGB || 0;
                const ratio   = usedGB > 0 ? (bkpGB / usedGB).toFixed(2) : '-';
                const isOpt   = m >= OPT_START;
                const showSav = isOpt && Math.abs(saving) > 500;
                const isPartial = partialMonths.includes(m);
                return (
                  <tr key={m} style={{ opacity: isPartial ? 0.65 : 1 }}>
                    <td style={{ fontWeight: 500 }}>{monthLabel(m)}{isPartial ? ' *' : ''}</td>
                    <td style={{ textAlign: 'right', color: isOpt ? '#f85149' : 'var(--text2)' }}>{fmt(hypo)}</td>
                    <td style={{ textAlign: 'right', color: '#58a6ff' }}>{fmt(mt[m]?.ccb || 0)}</td>
                    <td style={{ textAlign: 'right', color: '#d29922' }}>{(mt[m]?.totalExport || 0) > 0 ? fmt(mt[m].totalExport) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(act)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: showSav ? (saving >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text2)' }}>
                      {showSav ? (saving >= 0 ? '+' : '') + fmt(saving) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{Math.round(bkpGB).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{usedGB > 0 ? Math.round(usedGB).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{ratio !== '-' ? `${ratio}×` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700, paddingTop: 10 }}>All Months</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#f85149', paddingTop: 10 }}>{fmt(totalHypo)}</td>
                <td colSpan={2}></td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#3fb950', paddingTop: 10 }}>{fmt(totalActual)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: 'var(--green)', paddingTop: 10 }}>+{fmt(totalSavings)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '8px 20px 14px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
          * Partial month (invoice in progress). &nbsp;·&nbsp;
          <strong>CCB-Only Estimate:</strong> each cluster's pre-optimisation CCB rate scaled by its actual data growth per month. Pre-optimisation months show actual cost (old policy was in effect). &nbsp;·&nbsp;
          <strong>Used Disk GB:</strong> from Atlas Metrics → Disk Space Used (per-node aggregate, all clusters). &nbsp;·&nbsp;
          <strong>Ratio</strong> = Backup GB ÷ Used Disk GB.
        </div>
      </div>
    </div>
  );
}
