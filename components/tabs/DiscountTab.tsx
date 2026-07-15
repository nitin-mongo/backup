'use client';

import dynamic from 'next/dynamic';
import { monthLabel } from '@/lib/formatters';
import discountRaw from '@/data/discountData.json';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

const fmt = (n: number) => '$' + Math.round(n).toLocaleString();

interface MonthDiscount {
  grossTotal: number;
  netTotal: number;
  discount: number;
  discountPct: number;
  ccbGross: number;
  ccbNet: number;
  ccbDiscount: number;
  ccbDiscountPct: number;
  hasGrossData: boolean;
  contractActive: boolean;
}

interface DiscountData {
  discountByMonth: Record<string, MonthDiscount>;
  summary: {
    totalGross: number;
    totalNet: number;
    totalDiscount: number;
    contractStart: string;
    discountOnCCB: number;
    postContractGross: number;
    postContractDiscount: number;
  };
}

const data = discountRaw as DiscountData;
const months = Object.keys(data.discountByMonth).sort();
const S = data.summary;
const dm = data.discountByMonth;

// Months where we have CSV gross data
const csvMonths = months.filter(m => dm[m].hasGrossData);
const contractMonths = months.filter(m => dm[m].contractActive);
const avgMonthlyDiscount = S.postContractDiscount / contractMonths.length;
const avgCCBDiscPct = contractMonths
  .map(m => dm[m].ccbDiscountPct)
  .reduce((a, b) => a + b, 0) / contractMonths.length;

const GRID = '#21262d';
const tickK = { callback: (v: number | string) => '$' + (Number(v) / 1000).toFixed(0) + 'K' };

export default function DiscountTab() {
  const ml = months.map(monthLabel);

  // Gross vs Net grouped bar (only months with CSV data)
  const csvMl = csvMonths.map(monthLabel);
  const grossVsNetData = {
    labels: csvMl,
    datasets: [
      {
        label: 'Gross (Pre-Discount)',
        data: csvMonths.map(m => dm[m].grossTotal),
        backgroundColor: 'rgba(248,81,73,.65)',
        borderColor: '#f85149',
        borderWidth: 1,
      },
      {
        label: 'Net (Invoice Actual)',
        data: csvMonths.map(m => dm[m].netTotal),
        backgroundColor: 'rgba(88,166,255,.65)',
        borderColor: '#58a6ff',
        borderWidth: 1,
      },
    ],
  };

  // Discount amount by month (stacked: CCB discount + other)
  const discountBreakData = {
    labels: csvMl,
    datasets: [
      {
        label: 'CCB Discount (20% on PIT Restore)',
        data: csvMonths.map(m => Math.max(0, dm[m].ccbDiscount)),
        backgroundColor: '#3fb950',
        stack: 's',
      },
      {
        label: 'Other/Rounding',
        data: csvMonths.map(m => Math.max(0, dm[m].discount - dm[m].ccbDiscount)),
        backgroundColor: '#39d353',
        stack: 's',
      },
    ],
  };

  // CCB gross vs net (post-contract only)
  const ccbData = {
    labels: contractMonths.map(monthLabel),
    datasets: [
      {
        label: 'CCB Gross',
        data: contractMonths.map(m => dm[m].ccbGross),
        backgroundColor: 'rgba(248,81,73,.6)',
        borderColor: '#f85149',
        borderWidth: 1,
      },
      {
        label: 'CCB Net (billed)',
        data: contractMonths.map(m => dm[m].ccbNet),
        backgroundColor: 'rgba(63,185,80,.6)',
        borderColor: '#3fb950',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div>
      {/* Insight cards */}
      <div style={{
        background: 'linear-gradient(135deg,#0d2137,#162336)',
        border: '1px solid #1f4068',
        borderRadius: 12, padding: 24, marginBottom: 24
      }}>
        <h2 style={{ fontSize: 16, color: '#58a6ff', marginBottom: 12, fontWeight: 600 }}>
          Enterprise Discount Analysis — Contract Active Since Jan 2026 (~20% on CCB)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          {[
            { lb: 'Total Discount Received', vl: fmt(S.totalDiscount), dl: 'Jan 2026 – Jul 2026', cls: 'pos' },
            { lb: 'Avg Monthly Discount', vl: fmt(avgMonthlyDiscount), dl: 'Since contract start', cls: 'pos' },
            { lb: 'Discount Rate on CCB', vl: `~${avgCCBDiscPct.toFixed(1)}%`, dl: 'PIT Restore Storage', cls: 'pos' },
            { lb: 'Jun 2026 Gross', vl: fmt(dm['2026-06']?.grossTotal || 0), dl: 'Internal dashboard figure', cls: '' },
            { lb: 'Jun 2026 Net (Invoice)', vl: fmt(dm['2026-06']?.netTotal || 0), dl: 'Atlas invoice', cls: '' },
            { lb: 'Jun 2026 Discount', vl: fmt(dm['2026-06']?.discount || 0), dl: `${dm['2026-06']?.discountPct || 0}% of gross`, cls: 'pos' },
          ].map((ic, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#aab4be', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{ic.lb}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: ic.cls === 'pos' ? 'var(--green)' : '#e6edf3' }}>{ic.vl}</div>
              <div style={{ fontSize: 12, marginTop: 2, color: '#aab4be' }}>{ic.dl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Context card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>Why Gross ≠ Net</h3>
            <p style={{ fontSize: 13, color: '#aab4be', lineHeight: 1.7 }}>
              The <strong style={{ color: '#e6edf3' }}>internal dashboard shows gross (pre-discount)</strong> numbers from the MongoDB usage API.
              The <strong style={{ color: '#e6edf3' }}>Atlas invoice shows net (post-discount)</strong> numbers.
              The gap is almost entirely the <strong style={{ color: 'var(--green)' }}>~20% enterprise discount on Continuous Cloud Backup (PIT Restore Storage)</strong>.
              Snapshot export charges (S3 upload/restore/VM) are <em>not</em> discounted.
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>Contract Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { period: 'Jan 2025 – Dec 2025', status: 'No enterprise contract', color: 'var(--text2)', disc: '~0% discount' },
                { period: 'Jan 2026 onwards', status: 'Enterprise contract active', color: 'var(--green)', disc: '~20% on CCB' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{row.period}</div>
                    <div style={{ fontSize: 12, color: row.color }}>{row.status}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: row.color }}>{row.disc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gross vs Net chart */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#e6edf3' }}>Gross vs Net Monthly Cost (Jul 2025 – Jul 2026)</div>
        <p style={{ fontSize: 12, color: '#aab4be', marginBottom: 16 }}>Jan–Jun 2025 excluded — gross data not available in the usage CSV for those months.</p>
        <ChartWrapper type="bar" data={grossVsNetData} height={360} options={{
          plugins: {
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } },
            legend: { position: 'bottom', labels: { boxWidth: 12 } }
          },
          scales: { y: { ticks: tickK, grid: { color: GRID } }, x: { grid: { display: false } } }
        }} />
      </div>

      {/* Discount breakdown chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#e6edf3' }}>Monthly Discount Amount</div>
          <p style={{ fontSize: 12, color: '#aab4be', marginBottom: 16 }}>Discount = Gross − Net. Near-zero Jul–Dec '25 confirms no contract was active.</p>
          <ChartWrapper type="bar" data={discountBreakData} height={300} options={{
            plugins: {
              tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } },
              legend: { position: 'bottom', labels: { boxWidth: 12 } }
            },
            scales: { y: { ticks: tickK, grid: { color: GRID }, stacked: true }, x: { grid: { display: false }, stacked: true } }
          }} />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#e6edf3' }}>CCB Gross vs Net (Jan 2026+)</div>
          <p style={{ fontSize: 12, color: '#aab4be', marginBottom: 16 }}>~20% discount applied to CCB (PIT Restore Storage) since contract start.</p>
          <ChartWrapper type="bar" data={ccbData} height={300} options={{
            plugins: {
              tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } },
              legend: { position: 'bottom', labels: { boxWidth: 12 } }
            },
            scales: { y: { ticks: tickK, grid: { color: GRID } }, x: { grid: { display: false } } }
          }} />
        </div>
      </div>

      {/* Detail table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3' }}>Monthly Gross / Net / Discount Breakdown</h3>
          <span style={{ fontSize: 12, color: '#aab4be' }}>* = gross from internal usage dashboard; others gross = net (no contract)</span>
        </div>
        <div className="scr">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Contract</th>
                <th>Gross Total</th>
                <th>Net (Invoice)</th>
                <th>Discount $</th>
                <th>Disc %</th>
                <th>CCB Gross</th>
                <th>CCB Net</th>
                <th>CCB Disc $</th>
                <th>CCB Disc %</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const d = dm[m];
                const isContract = d.contractActive;
                return (
                  <tr key={m} style={isContract ? { background: 'rgba(63,185,80,.04)' } : {}}>
                    <td style={{ color: '#e6edf3' }}>
                      {m}{d.hasGrossData ? '' : ' †'}
                    </td>
                    <td style={{ textAlign: 'center', color: isContract ? 'var(--green)' : '#aab4be' }}>
                      {isContract ? '✓ Active' : '—'}
                    </td>
                    <td style={{ color: '#e6edf3' }}>{fmt(d.grossTotal)}</td>
                    <td style={{ color: '#e6edf3' }}>{fmt(d.netTotal)}</td>
                    <td style={{ color: d.discount > 100 ? 'var(--green)' : '#aab4be' }}>
                      {d.discount > 100 ? '+' : ''}{fmt(d.discount)}
                    </td>
                    <td style={{ color: d.discountPct > 5 ? 'var(--green)' : '#aab4be' }}>
                      {d.discountPct > 0.3 ? d.discountPct.toFixed(1) + '%' : '—'}
                    </td>
                    <td style={{ color: '#e6edf3' }}>{fmt(d.ccbGross)}</td>
                    <td style={{ color: '#e6edf3' }}>{fmt(d.ccbNet)}</td>
                    <td style={{ color: d.ccbDiscount > 100 ? 'var(--green)' : '#aab4be' }}>
                      {d.ccbDiscount > 100 ? '+' + fmt(d.ccbDiscount) : '—'}
                    </td>
                    <td style={{ color: d.ccbDiscountPct > 5 ? 'var(--green)' : '#aab4be' }}>
                      {d.ccbDiscountPct > 1 ? d.ccbDiscountPct.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Totals */}
              <tr className="totals-row">
                <td>TOTAL</td>
                <td></td>
                <td>{fmt(S.totalGross)}</td>
                <td>{fmt(S.totalNet)}</td>
                <td style={{ color: 'var(--green)' }}>+{fmt(S.totalDiscount)}</td>
                <td style={{ color: 'var(--green)' }}>{(S.totalDiscount / S.totalGross * 100).toFixed(1)}%</td>
                <td></td><td></td><td></td><td></td>
              </tr>
              <tr style={{ background: 'rgba(63,185,80,.06)' }}>
                <td style={{ color: 'var(--green)' }}>POST-CONTRACT</td>
                <td></td>
                <td style={{ color: 'var(--green)' }}>{fmt(S.postContractGross)}</td>
                <td></td>
                <td style={{ color: 'var(--green)' }}>+{fmt(S.postContractDiscount)}</td>
                <td style={{ color: 'var(--green)' }}>{(S.postContractDiscount / S.postContractGross * 100).toFixed(1)}%</td>
                <td></td><td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: '#aab4be' }}>† Gross data not available in usage CSV for Jan–Jun 2025; gross = net assumed (0% discount).</p>
        </div>
      </div>
    </div>
  );
}
