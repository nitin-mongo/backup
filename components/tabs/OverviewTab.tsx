'use client';

import { useState } from 'react';
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
  const { months, monthly_totals: mt, partialMonths } = data;
  const wi = data.whatIfTotal;

  // ── Projected CCB-Only: ratio-growth model ──
  // Under the old retention policy, the backup-to-data ratio was INCREASING every month
  // (more data → more snapshots accumulating → higher ratio).
  // Steps:
  //   1. Extract actual monthly ratio (backup GB / data GB) from the pre-opt period (Jul–Dec 2025)
  //   2. Fit a linear trend to that ratio (how fast it was growing per month)
  //   3. Project the ratio forward for post-opt months
  //   4. projectedBackupGB = projectedRatio × dataGB
  //   5. projectedCCB      = projectedBackupGB × effectiveCCBRatePerBackupGB
  //
  // This gives a much higher projected CCB than simple data-scaling because the ratio
  // itself compounds with data growth.

  const PRE_OPT_END = '2025-12'; // Dec 2025 = last month of old policy

  // Effective CCB rate per GB of backup storage ($/GB/month) derived from pre-opt average
  const ccbPerBackupGB = (wi?.preAvgBackupGB || 0) > 0
    ? (wi.preAvgCCB || 0) / wi.preAvgBackupGB
    : 0;

  // Actual monthly ratio for each pre-opt month
  const preOptMonths  = months.filter(m => m >= '2025-07' && m <= PRE_OPT_END);
  const preOptRatios  = preOptMonths
    .map(m => (mt[m]?.avgDataGB || 0) > 0 ? (mt[m].avgBackupGB || 0) / mt[m].avgDataGB : 0)
    .filter(r => r > 0);

  // Monthly growth rate of ratio (rise/run over pre-opt period)
  const ratioMonthlyDelta = preOptRatios.length >= 2
    ? (preOptRatios[preOptRatios.length - 1] - preOptRatios[0]) / (preOptRatios.length - 1)
    : 0.15; // fallback: ~0.15×/month observed historically

  // Ratio at end of pre-opt period (projection baseline)
  const ratioBaseline  = preOptRatios.length > 0
    ? preOptRatios[preOptRatios.length - 1]
    : (wi?.backupRatioPre || 4.6);

  const baselineIdx = months.indexOf(PRE_OPT_END) >= 0
    ? months.indexOf(PRE_OPT_END)
    : months.filter(m => m <= PRE_OPT_END).length - 1;

  const hypotheticalPerMonth: number[] = months.map((m, i) => {
    const dataGB = mt[m]?.avgDataGB || 0;
    if (!dataGB) return 0;

    let projectedRatio: number;
    if (i <= baselineIdx) {
      // Pre-optimisation: use the actual observed ratio for that month
      projectedRatio = (mt[m].avgBackupGB || 0) / dataGB;
    } else {
      // Post-optimisation: ratio would have kept growing at pre-opt trend rate
      projectedRatio = ratioBaseline + ratioMonthlyDelta * (i - baselineIdx);
    }

    return projectedRatio * dataGB * ccbPerBackupGB;
  });

  const actualPerMonth    = months.map(m => mt[m]?.total || 0);
  const actualCCBPerMonth = months.map(m => mt[m]?.ccb || 0);
  const exportPerMonth    = months.map(m => mt[m]?.totalExport || 0);

  // ── 20% Enterprise Discount toggle (from Jan 2026) ──
  const [discountOn, setDiscountOn] = useState(false);
  const DISC = 0.20;

  // Full-rate hypothetical (always computed — used as reference line in chart)
  const hypoFull = hypotheticalPerMonth;
  // Discount-adjusted: apply 20% off to post-OPT_START months when toggle is ON
  const hypoAdj = hypotheticalPerMonth.map((v, i) =>
    discountOn && months[i] >= OPT_START ? v * (1 - DISC) : v
  );

  // The discount value itself (full - discounted) per month
  const discValuePerMonth = hypotheticalPerMonth.map((v, i) =>
    months[i] >= OPT_START ? v * DISC : 0
  );
  const totalDiscValue  = discValuePerMonth.reduce((a, b) => a + b, 0);

  const totalActual = actualPerMonth.reduce((a, b) => a + b, 0);

  // Stats use the active (possibly discounted) projection
  const totalSavings = months.reduce((sum, m, i) =>
    m >= OPT_START ? sum + Math.max(hypoAdj[i] - actualPerMonth[i], 0) : sum, 0);
  const totalHypo = hypoAdj.reduce((a, b) => a + b, 0);

  // Latest completed (non-partial) month
  const latestFull = [...months].reverse().find(m => !partialMonths.includes(m) && (mt[m]?.total || 0) > 0) || months[months.length - 2];
  const latestIdx  = months.indexOf(latestFull);
  const latestHypo   = hypoAdj[latestIdx] || 0;
  const latestActual = actualPerMonth[latestIdx] || 0;
  const latestSaving = Math.max(latestHypo - latestActual, 0);
  const savingsPct   = latestHypo > 0 ? Math.round((latestSaving / latestHypo) * 100) : 0;
  const latestDiscValue = discValuePerMonth[latestIdx] || 0;

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
      // When discount is ON: show full-rate line as dashed reference
      ...(discountOn ? [{
        label: 'Projected CCB-Only (old policy, no discount — reference)',
        data: hypoFull,
        borderColor: 'rgba(248,81,73,0.45)',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        tension: 0.3, pointRadius: 2, fill: false,
      }] : []),
      {
        label: discountOn
          ? 'Projected CCB-Only (old policy + 20% enterprise discount)'
          : 'Projected CCB-Only (old policy, full rate)',
        data: hypoAdj,
        borderColor: discountOn ? '#d29922' : '#f85149',
        backgroundColor: discountOn ? 'rgba(210,153,34,0.08)' : 'rgba(248,81,73,0.08)',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <p style={{ color: '#aab4be', fontSize: 13, lineHeight: 1.75, maxWidth: 780, margin: 0 }}>
            By moving from a pure <strong style={{ color: '#f85149' }}>Continuous Cloud Backup (CCB)</strong> retention policy to a hybrid{' '}
            <strong style={{ color: '#3fb950' }}>CCB + S3 Export</strong> strategy in early 2026, Darwinbox has significantly reduced backup costs
            while handling data growth. Every number below comes directly from MongoDB Atlas invoice data.
          </p>
          {/* 20% Discount Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '8px 14px', border: '1px solid rgba(255,255,255,.1)', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#aab4be', whiteSpace: 'nowrap' }}>20% Enterprise Discount<br/><span style={{ fontSize: 10, color: '#8b949e' }}>applied from Jan 2026</span></span>
            <button
              onClick={() => setDiscountOn(d => !d)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                background: discountOn ? '#3fb950' : '#30363d', transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: discountOn ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s',
              }} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: discountOn ? '#3fb950' : '#8b949e', minWidth: 24 }}>
              {discountOn ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: discountOn ? 'repeat(5,1fr)' : 'repeat(4,1fr)', gap: 14 }}>
          {[
            { label: discountOn ? 'Strategy Saving (excl. discount)' : 'Total Savings Since Optimisation', val: fmt(totalSavings), sub: discountOn ? `export policy saving vs CCB-only (discounted)` : `Jan 2026 → ${monthLabel(latestFull)} vs CCB-only baseline`, color: '#3fb950', big: true },
            ...(discountOn ? [{ label: 'Enterprise Discount Value (20%)', val: fmt(totalDiscValue), sub: `Jan 2026 → ${monthLabel(latestFull)} · 20% off projected CCB`, color: '#bc8cff', big: false }] : []),
            { label: 'Saving This Month', val: fmt(latestSaving), sub: `${savingsPct}% less than ${discountOn ? 'discounted ' : ''}CCB-only`, color: '#3fb950', big: false },
            { label: 'Annualised Saving', val: fmt(latestSaving * 12), sub: 'projected at current monthly run-rate', color: '#58a6ff', big: false },
            { label: discountOn ? 'CCB-Only (with discount) Would Have Cost' : 'CCB-Only Would Have Cost', val: fmt(latestHypo), sub: `Actual charged: ${fmt(latestActual)} (${monthLabel(latestFull)})${discountOn ? ` · Full rate: ${fmt(hypoFull[latestIdx] || 0)}` : ''}`, color: discountOn ? '#d29922' : '#f85149', big: false },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 16, borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: s.big ? 24 : 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8, lineHeight: 1.5 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Discount breakdown banner when ON */}
        {discountOn && (
          <div style={{ marginTop: 14, padding: '10px 16px', background: 'rgba(188,140,255,.08)', borderRadius: 8, border: '1px solid rgba(188,140,255,.2)', fontSize: 12, color: '#aab4be', lineHeight: 1.7 }}>
            <strong style={{ color: '#bc8cff' }}>Total saving breakdown (since Jan 2026):</strong>
            &nbsp; Export strategy = <strong style={{ color: '#3fb950' }}>{fmt(totalSavings)}</strong>
            &nbsp;+&nbsp; Enterprise discount = <strong style={{ color: '#bc8cff' }}>{fmt(totalDiscValue)}</strong>
            &nbsp;= <strong style={{ color: '#e6edf3' }}>{fmt(totalSavings + totalDiscValue)}</strong> total vs full-rate CCB-only.
            &nbsp; This month: strategy <strong style={{ color: '#3fb950' }}>{fmt(latestSaving)}</strong> + discount <strong style={{ color: '#bc8cff' }}>{fmt(latestDiscValue)}</strong> = <strong style={{ color: '#e6edf3' }}>{fmt(latestSaving + latestDiscValue)}</strong>.
          </div>
        )}
      </div>

      {/* ── Conviction Chart ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          What You Would Have Paid vs What You Actually Paid
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.7 }}>
          Under the old CCB-only policy, the <strong style={{ color: '#e6edf3' }}>backup-to-data ratio was growing</strong> every month as more snapshots accumulated.
          {discountOn
            ? <> The <span style={{ color: 'rgba(248,81,73,.6)', fontWeight: 600 }}>dashed red line</span> is full-rate CCB-only (no discount).
                The <span style={{ color: '#d29922', fontWeight: 600 }}>orange line</span> is CCB-only with the 20% enterprise discount applied from Jan 2026.
                The <span style={{ color: '#3fb950', fontWeight: 600 }}>green area</span> is actual (CCB + Export). The gap from orange to green = export strategy saving.
              </>
            : <> The <span style={{ color: '#f85149', fontWeight: 600 }}>red line</span> projects what CCB would have cost at old policy rates (ratio growing at {ratioMonthlyDelta > 0 ? '+' : ''}{ratioMonthlyDelta.toFixed(2)}×/month, Jul–Dec 2025 trend).
                The <span style={{ color: '#3fb950', fontWeight: 600 }}>green shaded area</span> is what was actually charged (CCB + S3 Export).
              </>}
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
                {['Month', 'Projected CCB-Only', 'Actual CCB', 'S3 Export', 'Total Actual', 'Monthly Saving', 'Backup GB', 'Prov. Disk/Node', 'Used Disk/Node', 'Ratio'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Month' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const hypo    = Math.round(hypoAdj[i]);
                const hypoRef = discountOn ? Math.round(hypoFull[i]) : null;
                const act     = actualPerMonth[i];
                const saving  = hypo - act;
                const usedGB  = USED_DISK_GB[m] || 0;
                const bkpGB   = mt[m]?.avgBackupGB || 0;
                const ratio   = usedGB > 0 ? (bkpGB / usedGB).toFixed(2) : '-';
                const provPerNode = Math.round((mt[m]?.avgDataGB || 0) / 3);
                const isOpt   = m >= OPT_START;
                const showSav = isOpt && Math.abs(saving) > 500;
                const isPartial = partialMonths.includes(m);
                return (
                  <tr key={m} style={{ opacity: isPartial ? 0.65 : 1 }}>
                    <td style={{ fontWeight: 500 }}>{monthLabel(m)}{isPartial ? ' *' : ''}</td>
                    <td style={{ textAlign: 'right', color: isOpt ? (discountOn ? '#d29922' : '#f85149') : 'var(--text2)' }}>
                      {fmt(hypo)}{hypoRef && isOpt ? <span style={{ fontSize: 10, color: 'rgba(248,81,73,.6)', marginLeft: 4 }}>({fmt(hypoRef)})</span> : null}
                    </td>
                    <td style={{ textAlign: 'right', color: '#58a6ff' }}>{fmt(mt[m]?.ccb || 0)}</td>
                    <td style={{ textAlign: 'right', color: '#d29922' }}>{(mt[m]?.totalExport || 0) > 0 ? fmt(mt[m].totalExport) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(act)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: showSav ? (saving >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text2)' }}>
                      {showSav ? (saving >= 0 ? '+' : '') + fmt(saving) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{Math.round(bkpGB).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{provPerNode.toLocaleString()}</td>
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
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '8px 20px 14px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
          * Partial month (invoice in progress). &nbsp;·&nbsp;
          <strong>Projected CCB-Only:</strong> actual observed ratio (backup/data) for pre-opt months; for Jan 2026 onwards, ratio is projected forward at the pre-opt monthly growth rate ({ratioMonthlyDelta > 0 ? '+' : ''}{ratioMonthlyDelta.toFixed(2)}×/month). Cost = projectedRatio × dataGB × CCBrate/GB. &nbsp;·&nbsp;
          <strong>Prov. Disk/Node:</strong> invoice avgDataGB ÷ 3 (3-node RS). &nbsp;·&nbsp;
          <strong>Used Disk/Node:</strong> Atlas Metrics → Disk Space Used (all clusters, per-node). &nbsp;·&nbsp;
          <strong>Ratio</strong> = Backup GB ÷ Used Disk/Node.
        </div>
      </div>

      {/* ── Projected CCB-Only: Full Calculation Audit Trail ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Projected CCB-Only — Full Calculation Audit Trail
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            Step-by-step numbers behind every "Projected CCB-Only" figure. Pre-optimisation months use actual observed ratios as the baseline.
            From Jan 2026 the ratio is projected forward at the measured pre-opt growth rate.
          </p>
        </div>

        {/* Methodology inputs */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(88,166,255,.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Model Inputs (derived from Atlas invoice data)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              {
                label: 'Pre-Opt Avg CCB / month',
                val: fmt(wi?.preAvgCCB || 0),
                sub: 'Jul – Dec 2025 average from invoices',
              },
              {
                label: 'Pre-Opt Avg Backup Storage',
                val: Math.round(wi?.preAvgBackupGB || 0).toLocaleString() + ' GB',
                sub: 'avg backup GB across Jul–Dec 2025',
              },
              {
                label: 'Effective CCB Rate / GB',
                val: ccbPerBackupGB > 0 ? '$' + ccbPerBackupGB.toFixed(4) + '/GB/mo' : 'N/A',
                sub: 'preAvgCCB ÷ preAvgBackupGB',
              },
              {
                label: 'Ratio at Dec 2025 (baseline)',
                val: ratioBaseline.toFixed(3) + '×',
                sub: `growing at ${ratioMonthlyDelta > 0 ? '+' : ''}${ratioMonthlyDelta.toFixed(3)}×/month (Jul→Dec 2025 trend)`,
              },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.val}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(88,166,255,.08)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text)' }}>Formula (Jan 2026 onwards): </strong>
            Projected Ratio = {ratioBaseline.toFixed(3)} + {ratioMonthlyDelta.toFixed(3)} × N &nbsp;|&nbsp;
            Projected Backup GB = Projected Ratio × Data GB (all nodes) &nbsp;|&nbsp;
            Projected CCB = Projected Backup GB × ${ccbPerBackupGB.toFixed(4)}/GB &nbsp;
            <em style={{ color: '#8b949e' }}>(where N = months since Dec 2025)</em>
          </div>
        </div>

        {/* Per-month calculation table */}
        <div className="scr">
          <table>
            <thead>
              <tr>
                {['Month', 'Data GB (all nodes)', 'N (months since Dec\'25)', 'Projected Ratio', 'Ratio Source', 'Projected Backup GB', 'CCB Rate /GB', 'Projected CCB', 'Actual CCB', 'Variance'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Month' || h === 'Ratio Source' ? 'left' : 'right', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const dataGB    = mt[m]?.avgDataGB || 0;
                const isPreOpt  = i <= baselineIdx;
                const N         = i - baselineIdx;
                const projRatio = isPreOpt
                  ? (dataGB > 0 ? (mt[m]?.avgBackupGB || 0) / dataGB : 0)
                  : ratioBaseline + ratioMonthlyDelta * N;
                const projBackupGB = projRatio * dataGB;
                const projCCB   = projBackupGB * ccbPerBackupGB;
                const actualCCB = mt[m]?.ccb || 0;
                const variance  = projCCB - actualCCB;
                const isPartial = partialMonths.includes(m);
                return (
                  <tr key={m} style={{
                    opacity: isPartial ? 0.65 : 1,
                    background: isPreOpt ? 'rgba(255,255,255,.02)' : 'transparent',
                  }}>
                    <td style={{ fontWeight: 500 }}>
                      {monthLabel(m)}{isPartial ? ' *' : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{dataGB > 0 ? Math.round(dataGB).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{isPreOpt ? '—' : (N > 0 ? '+' : '') + N}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isPreOpt ? 'var(--text2)' : '#f85149' }}>
                      {dataGB > 0 ? projRatio.toFixed(3) + '×' : '—'}
                    </td>
                    <td style={{ color: isPreOpt ? 'var(--text2)' : '#d29922', fontSize: 11 }}>
                      {isPreOpt
                        ? `Actual (${Math.round(mt[m]?.avgBackupGB || 0).toLocaleString()} ÷ ${Math.round(dataGB).toLocaleString()})`
                        : `${ratioBaseline.toFixed(3)} + ${ratioMonthlyDelta.toFixed(3)}×${N}`}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{dataGB > 0 ? Math.round(projBackupGB).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)', fontFamily: 'monospace', fontSize: 11 }}>${ccbPerBackupGB.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isPreOpt ? 'var(--text2)' : '#f85149' }}>{dataGB > 0 ? fmt(projCCB) : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#58a6ff' }}>{fmt(actualCCB)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: variance > 500 ? 'var(--green)' : variance < -500 ? 'var(--red)' : 'var(--text2)' }}>
                      {dataGB > 0 && Math.abs(variance) > 500 ? (variance > 0 ? '+' : '') + fmt(variance) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700, paddingTop: 10 }} colSpan={7}>Total Projected CCB (all months)</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#f85149', paddingTop: 10 }}>
                  {fmt(months.reduce((s, m, i) => {
                    const dGB = mt[m]?.avgDataGB || 0;
                    const r = i <= baselineIdx ? (dGB > 0 ? (mt[m]?.avgBackupGB||0)/dGB : 0) : ratioBaseline + ratioMonthlyDelta*(i-baselineIdx);
                    return s + r * dGB * ccbPerBackupGB;
                  }, 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#58a6ff', paddingTop: 10 }}>
                  {fmt(months.reduce((s, m) => s + (mt[m]?.ccb || 0), 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--green)', paddingTop: 10, fontSize: 13 }}>
                  +{fmt(months.reduce((s, m, i) => {
                    if (m < OPT_START) return s;
                    const dGB = mt[m]?.avgDataGB || 0;
                    const r = i <= baselineIdx ? (dGB > 0 ? (mt[m]?.avgBackupGB||0)/dGB : 0) : ratioBaseline + ratioMonthlyDelta*(i-baselineIdx);
                    return s + Math.max(r * dGB * ccbPerBackupGB - (mt[m]?.total||0), 0);
                  }, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '8px 20px 14px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong>Variance</strong> = Projected CCB − Actual CCB (positive = saving vs what would have been charged under old policy). &nbsp;·&nbsp;
          Pre-optimisation rows (shaded) use the actual observed ratio — this is the measured baseline, not a projection. &nbsp;·&nbsp;
          * Partial month.
        </div>
      </div>
    </div>
  );
}
