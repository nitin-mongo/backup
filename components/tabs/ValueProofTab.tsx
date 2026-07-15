'use client';

import dynamic from 'next/dynamic';
import { monthLabel } from '@/lib/formatters';
import raw from '@/data/valueProofData.json';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
const fmtGB = (n: number) => Math.round(n).toLocaleString() + ' GB';

const data = raw as typeof raw;
const S = data.summary;
const PRE = data.preOptStats;
const CUR = data.currentStats;
const proj = data.projections as Record<string, typeof data.projections['2026-01']>;
const hist = data.historicalRatios as Record<string, { ratio: number; dataGB: number; backupGB: number }>;

const GRID = '#21262d';
const tickK = { callback: (v: number | string) => '$' + (Number(v) / 1000).toFixed(0) + 'K' };

// All months in order for ratio chart
const allMonths = Object.keys(hist).sort();
const proj2026 = Object.keys(proj).sort();

// Build ratio trend line (extrapolated 4.63 + 0.145/mo from Jan 2026)
const trendRatios: Record<string, number> = {};
proj2026.forEach((m, i) => {
  trendRatios[m] = +(4.63 + 0.145 * (i + 1)).toFixed(2);
});

export default function ValueProofTab() {
  // ── Chart 1: Backup Ratio over time (actual + projected trend) ──
  const ratioLabels = allMonths.map(monthLabel);
  const actualRatioData = allMonths.map(m => hist[m]?.ratio ?? null);

  // Trend: null for pre-2026, then the extrapolated values
  const trendData = allMonths.map(m => m >= '2026-01' ? trendRatios[m] : null);

  const ratioChartData = {
    labels: ratioLabels,
    datasets: [
      {
        label: 'Actual Backup:Data Ratio',
        data: actualRatioData,
        borderColor: '#58a6ff',
        backgroundColor: 'rgba(88,166,255,.15)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Where Ratio Would Be (No Optimization)',
        data: allMonths.map(m => m >= '2026-01' ? trendRatios[m] : null),
        borderColor: '#f85149',
        backgroundColor: 'rgba(248,81,73,.08)',
        borderDash: [6, 3],
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };

  // Re-build labels with trend overlay starting from Dec 2025 anchor
  const allMonthsWithTrend = [...allMonths];
  const ratioActual = allMonths.map(m => hist[m]?.ratio ?? null);
  const ratioTrendLine = allMonths.map(m => {
    if (m < '2026-01') return null;
    return trendRatios[m];
  });
  // Add Dec 2025 anchor point to trend line
  const dec25Idx = allMonths.indexOf('2025-12');
  if (dec25Idx >= 0) ratioTrendLine[dec25Idx] = 4.63;

  const ratioChart2 = {
    labels: allMonths.map(monthLabel),
    datasets: [
      {
        label: 'Actual Ratio',
        data: ratioActual,
        borderColor: '#58a6ff',
        backgroundColor: 'rgba(88,166,255,.12)',
        fill: false,
        tension: 0.3,
        pointRadius: actualRatioData.map((_, i) =>
          allMonths[i] >= '2026-06' ? 6 : 3
        ) as number[],
        pointBackgroundColor: actualRatioData.map((_, i) =>
          allMonths[i] >= '2026-06' ? '#3fb950' : '#58a6ff'
        ) as string[],
      },
      {
        label: 'Projected Trend (No Optimization)',
        data: ratioTrendLine,
        borderColor: '#f85149',
        borderDash: [6, 3],
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointStyle: 'rectRot',
      },
    ],
  };

  // ── Chart 2: Actual vs Hypothetical cost (2026 months) ──
  const costLabels = proj2026.map(monthLabel);
  const costChart = {
    labels: costLabels,
    datasets: [
      {
        label: 'Without Optimization (conservative est.)',
        data: proj2026.map(m => proj[m].hypTotalCons),
        backgroundColor: 'rgba(248,81,73,.65)',
        borderColor: '#f85149',
        borderWidth: 1,
      },
      {
        label: 'Actual Atlas Invoice',
        data: proj2026.map(m => proj[m].actualAtlasTotal),
        backgroundColor: 'rgba(88,166,255,.65)',
        borderColor: '#58a6ff',
        borderWidth: 1,
      },
    ],
  };

  // ── Chart 3: Data grew, but backup storage & cost dropped ──
  const indexChart = {
    labels: allMonths.map(monthLabel),
    datasets: [
      {
        label: 'Actual Data Size (indexed, Jan\'25 = 100)',
        data: allMonths.map(m => hist[m] ? +(hist[m].dataGB / 116212 * 100).toFixed(1) : null),
        borderColor: '#d29922',
        tension: 0.3,
        fill: false,
        pointRadius: 3,
      },
      {
        label: 'Backup Storage (indexed, Jan\'25 = 100)',
        data: allMonths.map(m => hist[m] ? +(hist[m].backupGB / 352342 * 100).toFixed(1) : null),
        borderColor: '#f85149',
        tension: 0.3,
        fill: false,
        borderDash: [4, 2],
        pointRadius: 3,
      },
      {
        label: 'Atlas Monthly Cost (indexed, Jan\'25 = 100)',
        data: allMonths.map(m => {
          const mt = (raw as any)._monthlyTotals?.[m];
          return null; // placeholder
        }),
        borderColor: '#3fb950',
        tension: 0.3,
        fill: false,
        pointRadius: 3,
      },
    ],
  };

  const heroStats = [
    { num: `${S.ccbDropPct}%`, label: 'CCB Cost Reduction', sub: `$${(PRE.avgCCB/1000).toFixed(0)}K → $${(CUR.atlasTotal/1000).toFixed(0)}K/mo`, color: '#3fb950' },
    { num: `${S.ratioImprovement}%`, label: 'Backup Overhead Cut', sub: `${PRE.ratioAvg}× → ${CUR.ratio}× ratio`, color: '#3fb950' },
    { num: `${S.dataGrowthPct}%`, label: 'More Data (39% growth)', sub: `${(PRE.avgDataGB/1000).toFixed(0)}K → ${(CUR.dataGB/1000).toFixed(0)}K GB`, color: '#d29922' },
    { num: `${S.backupGBDropPct}%`, label: 'Less Backup Storage', sub: `${(PRE.avgBackupGB/1000).toFixed(0)}K → ${(CUR.backupGB/1000).toFixed(0)}K GB`, color: '#3fb950' },
    { num: `${S.costPerGBImprovement}%`, label: 'Cheaper per GB of Data', sub: `$${PRE.costPerDataGB}/GB → $${CUR.costPerDataGB}/GB`, color: '#3fb950' },
    { num: fmt(S.annualizedSavingsCons), label: 'Annual Savings (Conservative)', sub: 'vs flat pre-opt ratio with discount', color: '#58a6ff' },
  ];

  return (
    <div>
      {/* Hero Banner */}
      <div style={{ background: 'linear-gradient(135deg,#0a1f2e,#132b3a)', border: '1px solid #1d4f6e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, color: '#58a6ff', marginBottom: 4, fontWeight: 700 }}>
          Value Proof: The Optimization Is Delivering — Backed by Invoice Data
        </h2>
        <p style={{ color: '#aab4be', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          Data grew <strong style={{ color: '#d29922' }}>+{S.dataGrowthPct}%</strong> from the pre-optimization period, yet backup costs fell significantly. These numbers come directly from MongoDB Atlas invoices and the gross usage report.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {heroStats.map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 18, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.num}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#aab4be', marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Argument cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        {[
          {
            title: 'Argument 1: More Data, Lower Costs',
            color: '#3fb950',
            points: [
              `Data size grew ${S.dataGrowthPct}% (${(PRE.avgDataGB/1000).toFixed(0)}K → ${(CUR.dataGB/1000).toFixed(0)}K GB)`,
              `Backup storage DROPPED ${S.backupGBDropPct}% (${(PRE.avgBackupGB/1000).toFixed(0)}K → ${(CUR.backupGB/1000).toFixed(0)}K GB)`,
              `Old system would hold ${fmtGB(CUR.dataGB * PRE.ratioAvg)} backup for same data`,
              `We hold only ${fmtGB(CUR.backupGB)} — ${Math.round((1 - CUR.backupGB/(CUR.dataGB * PRE.ratioAvg))*100)}% less storage`,
            ],
          },
          {
            title: 'Argument 2: The Ratio Was Getting Worse',
            color: '#f85149',
            points: [
              `Jan 2025: 3.03× ratio (backup:data)`,
              `Jul 2025: 4.30× ratio — growing every month`,
              `Dec 2025: 4.63× — trending toward 5-6× by mid-2026`,
              `Today: 1.48× — a 64% improvement from the trend`,
            ],
          },
          {
            title: 'Argument 3: The Math on Avoided Cost',
            color: '#58a6ff',
            points: [
              `At pre-opt ratio (4.16×) & today\'s data: ${fmtGB(Math.round(CUR.dataGB * PRE.ratioAvg))} backup`,
              `At pre-opt rate ($${PRE.ccbRatePerGB}/GB): ${fmt(CUR.dataGB * PRE.ratioAvg * PRE.ccbRatePerGB)} gross CCB`,
              `With 20% discount: ${fmt(CUR.dataGB * PRE.ratioAvg * PRE.ccbRatePerGB * 0.8)} vs actual ${fmt(CUR.atlasTotal)}`,
              `Conservative monthly gap: ${fmt(proj['2026-06'].savingsCons)} — purely from backup efficiency`,
            ],
          },
        ].map((card, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: card.color, marginBottom: 14 }}>{card.title}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {card.points.map((p, j) => (
                <li key={j} style={{ fontSize: 13, color: '#e6edf3', padding: '6px 0', borderBottom: j < card.points.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: card.color, fontWeight: 700, flexShrink: 0 }}>→</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Ratio trend chart */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3' }}>Backup:Data Ratio — Actual vs Where It Was Heading</div>
            <p style={{ fontSize: 12, color: '#aab4be', marginTop: 4 }}>
              The dashed red line extrapolates the Jan–Dec 2025 growth trend (+0.15×/month). By Jun 2026, the ratio would have exceeded 5.5× without intervention.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {[['─', '#58a6ff', 'Actual'], ['- -', '#f85149', 'No-opt trend']].map(([dash, col, lbl]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#aab4be' }}>
                <span style={{ color: col as string, fontWeight: 700 }}>{dash}</span> {lbl}
              </div>
            ))}
          </div>
        </div>
        <ChartWrapper type="line" data={ratioChart2} height={320} options={{
          plugins: {
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + Number(c.raw).toFixed(2) + '×' } },
            legend: { display: false },
          },
          scales: {
            y: { ticks: { callback: (v) => Number(v).toFixed(1) + '×' }, grid: { color: GRID }, min: 1 },
            x: { grid: { display: false } }
          }
        }} />
      </div>

      {/* Actual vs Hypothetical cost */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>Actual vs Hypothetical Atlas Cost (2026)</div>
          <p style={{ fontSize: 12, color: '#aab4be', marginBottom: 16 }}>
            Hypothetical = flat 4.16× ratio (pre-opt avg) applied to actual data sizes, with 20% CCB discount. Conservative estimate.
          </p>
          <ChartWrapper type="bar" data={costChart} height={280} options={{
            plugins: {
              tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } },
              legend: { position: 'bottom', labels: { boxWidth: 12 } }
            },
            scales: { y: { ticks: tickK, grid: { color: GRID } }, x: { grid: { display: false } } }
          }} />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3', marginBottom: 12 }}>Jun 2026 — The Full Picture</div>
          {[
            { label: 'Hypothetical backup storage (4.16× ratio)', val: fmtGB(proj['2026-06'].hypBackupGBcons), color: '#f85149' },
            { label: 'Actual backup storage', val: fmtGB(proj['2026-06'].actualBackupGB || 226728), color: '#3fb950' },
            { label: '', val: '', color: '' },
            { label: 'Hypothetical CCB gross (no opt)', val: fmt(proj['2026-06'].hypCCBGrossCons), color: '#f85149' },
            { label: 'Hypothetical CCB net (−20% disc)', val: fmt(proj['2026-06'].hypCCBNetCons), color: '#f85149' },
            { label: 'Actual CCB net (invoice)', val: fmt(proj['2026-06'].actualCCBNet), color: '#3fb950' },
            { label: '', val: '', color: '' },
            { label: 'Hypothetical Atlas total', val: fmt(proj['2026-06'].hypTotalCons), color: '#f85149' },
            { label: 'Actual Atlas total (invoice)', val: fmt(proj['2026-06'].actualAtlasTotal), color: '#58a6ff' },
            { label: '→ Conservative Monthly Saving', val: fmt(proj['2026-06'].savingsCons), color: '#3fb950', bold: true },
            { label: '→ Conservative Annual Saving', val: fmt(proj['2026-06'].savingsCons * 12), color: '#3fb950', bold: true },
          ].filter(row => row.label || row.val).map((row, i) => (
            row.label === '' ? <div key={i} style={{ height: 8 }} /> :
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: '#aab4be' }}>{row.label}</div>
              <div style={{ fontSize: 13, fontWeight: row.bold ? 700 : 500, color: row.color }}>{row.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly savings table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3' }}>Month-by-Month: Actual vs Hypothetical (Jan–Jul 2026)</h3>
          <span style={{ fontSize: 12, color: '#aab4be' }}>† May 2026 had one-time bulk S3 export costs for initial migration</span>
        </div>
        <div className="scr">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Data GB</th>
                <th>Actual Ratio</th>
                <th>Hyp Backup GB</th>
                <th>Hyp CCB Gross</th>
                <th>Hyp CCB Net (−20%)</th>
                <th>Actual Atlas Total</th>
                <th>Monthly Saving</th>
                <th>Saving %</th>
              </tr>
            </thead>
            <tbody>
              {proj2026.map(m => {
                const p = proj[m];
                const isMay = m === '2026-05';
                const isJun = m === '2026-06';
                return (
                  <tr key={m} style={{
                    background: isJun ? 'rgba(63,185,80,.06)' : isMay ? 'rgba(210,153,34,.04)' : 'transparent'
                  }}>
                    <td style={{ color: '#e6edf3', fontWeight: isJun ? 700 : 400 }}>
                      {m}{isMay ? ' †' : ''}
                    </td>
                    <td style={{ color: '#e6edf3' }}>{p.dataGB.toLocaleString()}</td>
                    <td style={{ color: p.actualRatio < 2 ? '#3fb950' : '#d29922' }}>{p.actualRatio}×</td>
                    <td style={{ color: '#f85149' }}>{p.hypBackupGBcons.toLocaleString()}</td>
                    <td style={{ color: '#f85149' }}>{fmt(p.hypCCBGrossCons)}</td>
                    <td style={{ color: '#f85149' }}>{fmt(p.hypCCBNetCons)}</td>
                    <td style={{ color: '#58a6ff', fontWeight: 500 }}>{fmt(p.actualAtlasTotal)}</td>
                    <td style={{ color: p.savingsCons > 0 ? '#3fb950' : '#f85149', fontWeight: isJun ? 700 : 400 }}>
                      {p.savingsCons > 0 ? '+' : ''}{fmt(p.savingsCons)}
                    </td>
                    <td style={{ color: p.savingsCons > 0 ? '#3fb950' : '#f85149' }}>
                      {p.savingsCons > 0 ? p.savingsPctCons + '%' : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr className="totals-row">
                <td colSpan={6} style={{ color: '#e6edf3', textAlign: 'left' }}>CUMULATIVE (Jan–Jul 2026, conservative)</td>
                <td></td>
                <td style={{ color: '#3fb950' }}>+{fmt(S.cumulativeSavingsCons)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Closing talking points */}
      <div style={{ background: 'var(--surface)', border: '1px solid #1f4068', borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#58a6ff', marginBottom: 16 }}>Talking Points for Customer Conversation</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            {
              title: '"Your data grew, but costs fell"',
              body: `You have ${S.dataGrowthPct}% more data today than in the pre-optimization period, yet your backup storage dropped ${S.backupGBDropPct}% and CCB costs dropped ${S.ccbDropPct}%. You\'re doing more with less.`,
            },
            {
              title: '"The ratio was on a trajectory to get worse"',
              body: `From Jan to Dec 2025, the backup:data ratio grew from 3.0× to 4.6× — about +0.15× every month. Without action, you would have been paying for 5.5–6× overhead by now. Today it\'s 1.48×.`,
            },
            {
              title: '"The conservative math is still compelling"',
              body: `Even assuming the ratio stayed flat at the pre-opt average (4.16×) and you kept the 20% enterprise discount, June 2026 would cost ${fmt(proj['2026-06'].hypTotalCons)} vs actual ${fmt(proj['2026-06'].actualAtlasTotal)} — a ${fmt(proj['2026-06'].savingsCons)} monthly difference. Annualized: ${fmt(proj['2026-06'].savingsCons * 12)}.`,
            },
            {
              title: '"Cost per GB is the fairest metric"',
              body: `Before optimization: $${PRE.costPerDataGB}/GB of actual data. Today: $${CUR.costPerDataGB}/GB — a ${S.costPerGBImprovement}% improvement in cost efficiency, despite data growth and S3 export charges being a new cost line.`,
            },
          ].map((tp, i) => (
            <div key={i} style={{ padding: 16, background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>{tp.title}</div>
              <div style={{ fontSize: 13, color: '#aab4be', lineHeight: 1.7 }}>{tp.body}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 14, background: 'rgba(63,185,80,.08)', border: '1px solid rgba(63,185,80,.3)', borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: '#aab4be', lineHeight: 1.6 }}>
            <strong style={{ color: '#3fb950' }}>Note on May 2026:</strong> May shows higher-than-hypothetical costs because it was the initial bulk-export month when all 27 clusters were migrated to S3 — a one-time setup cost. Jun 2026 onwards represents the normalized, ongoing cost of the new backup strategy.
          </p>
        </div>
      </div>
    </div>
  );
}
