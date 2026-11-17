'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { daysInMonth, monthLabel } from '@/lib/formatters';
import discountRaw from '@/data/discountData.json';
import S3ImplementationCostReview, { customerS3ChartTotals, getProjectedBaselineCosts } from '@/components/tabs/S3ImplementationCostReview';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });
const fmtCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const fmtCurrencyExact = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const fmtPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

interface Props {
  data: DashboardData;
}

interface CCBDiscountMonth {
  ccbGross: number;
  ccbNet: number;
  ccbDiscount: number;
  ccbDiscountPct: number;
}

export default function ExecutiveSummaryTab({ data }: Props) {
  const { monthly_totals: totals } = data;
  const months2025 = Array.from({ length: 12 }, (_, index) => `2025-${String(index + 1).padStart(2, '0')}`);
  const yearRows = months2025.map(month => ({
    month,
    backupGB: totals[month]?.avgBackupGB ?? null,
    backupCost: totals[month]?.total ?? null,
  }));
  const janStorage = totals['2025-01']?.avgBackupGB ?? 0;
  const decStorage = totals['2025-12']?.avgBackupGB ?? 0;
  const janCost = totals['2025-01']?.total ?? 0;
  const decCost = totals['2025-12']?.total ?? 0;
  const storageGrowth = janStorage ? (decStorage / janStorage - 1) * 100 : 0;
  const costGrowth = janCost ? (decCost / janCost - 1) * 100 : 0;
  const ccbDiscountByMonth = discountRaw.discountByMonth as Record<string, CCBDiscountMonth>;
  const decemberCCBNet = ccbDiscountByMonth['2025-12']?.ccbNet || 0;
  const decemberBackupGB = totals['2025-12']?.avgBackupGB || 0;
  const changeRows = ['2026-01', '2026-02', '2026-03', '2026-04'].map(month => {
    const monthly = totals[month];
    const discount = ccbDiscountByMonth[month];
    const defragStorageReduction = decemberCCBNet - discount.ccbGross;
    const totalReduction = decemberCCBNet - discount.ccbNet;
    const actualBackupCost = monthly.total;

    return {
      month,
      projectedBackupGB: decemberBackupGB,
      actualBackupGB: monthly.avgBackupGB,
      storageVsDecember: decemberBackupGB - monthly.avgBackupGB,
      defragStorageReduction,
      ccbDiscount: discount.ccbDiscount,
      actualBackupCost,
      projectedBackupCost: actualBackupCost + totalReduction,
      totalReduction,
    };
  });
  const changeTotals = changeRows.reduce((totals, row) => ({
    defragStorageReduction: totals.defragStorageReduction + row.defragStorageReduction,
    ccbDiscount: totals.ccbDiscount + row.ccbDiscount,
    actualBackupCost: totals.actualBackupCost + row.actualBackupCost,
    projectedBackupCost: totals.projectedBackupCost + row.projectedBackupCost,
    totalReduction: totals.totalReduction + row.totalReduction,
  }), { defragStorageReduction: 0, ccbDiscount: 0, actualBackupCost: 0, projectedBackupCost: 0, totalReduction: 0 });
  const novemberDaysCovered = data.partialMonthDays?.['2026-11'] ?? 14;
  const novemberPeriodLabel = `Nov 1–${novemberDaysCovered}`;
  const novemberActualBackupSpend = totals['2026-11']?.total ?? 0;
  const novemberProjectedBackupSpend = novemberActualBackupSpend * daysInMonth('2026-11') / novemberDaysCovered;
  const decemberProjectedBackupSpend = novemberProjectedBackupSpend * daysInMonth('2026-12') / daysInMonth('2026-11');
  const projectedBaselineCosts = getProjectedBaselineCosts(data);
  const comparisonRows = Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`).map(month => {
    const month2025 = `2025-${month.slice(-2)}`;
    const backupCost2025 = totals[month2025]?.total ?? 0;
    const backupCost2026 = customerS3ChartTotals[month]
      ?? (month === '2026-11' ? novemberProjectedBackupSpend : month === '2026-12' ? decemberProjectedBackupSpend : totals[month]?.total ?? 0);
    return {
      month,
      backupCost2025,
      backupCost2026,
      backupCostWithoutS3: projectedBaselineCosts[month],
      incomplete: month >= '2026-09',
      basis: month === '2026-09' || month === '2026-10'
        ? 'Invoice actual'
        : month === '2026-11' || month === '2026-12'
        ? 'Projected run rate*'
        : month >= '2026-09'
          ? 'Atlas only*'
          : customerS3ChartTotals[month] !== undefined
            ? 'Invoice + S3 estimate'
            : 'Invoice actual',
    };
  });
  const comparisonTotals = comparisonRows.reduce((sum, row) => ({
    backupCost2025: sum.backupCost2025 + row.backupCost2025,
    backupCost2026: sum.backupCost2026 + row.backupCost2026,
    backupCostWithoutS3: sum.backupCostWithoutS3 + row.backupCostWithoutS3,
  }), { backupCost2025: 0, backupCost2026: 0, backupCostWithoutS3: 0 });
  const ccbDiscountsJanToOct = Object.entries(ccbDiscountByMonth)
    .filter(([month]) => month >= '2026-01' && month <= '2026-10')
    .reduce((sum, [, monthData]) => sum + monthData.ccbDiscount, 0);
  const atlasBackupSpendJanToOct = Object.entries(totals)
    .filter(([month]) => month >= '2026-01' && month <= '2026-10')
    .reduce((sum, [, monthData]) => sum + monthData.total, 0);
  const knownCustomerS3Spend = Object.values(customerS3ChartTotals).reduce((sum, value) => sum + value, 0)
    - ['2026-05', '2026-06', '2026-07', '2026-08'].reduce((sum, month) => sum + (totals[month]?.total || 0), 0);
  const backupSpend2025 = months2025.reduce((sum, month) => sum + (totals[month]?.total || 0), 0);
  const knownBackupSpendToNovember = atlasBackupSpendJanToOct + novemberActualBackupSpend + knownCustomerS3Spend;
  const projectedBackupSpend2026 = atlasBackupSpendJanToOct + novemberProjectedBackupSpend + decemberProjectedBackupSpend + knownCustomerS3Spend;
  const ccbDiscountActualThroughNovember = ccbDiscountsJanToOct + (ccbDiscountByMonth['2026-11']?.ccbDiscount || 0);
  const novemberProjectedCCBDiscount = (ccbDiscountByMonth['2026-11']?.ccbDiscount || 0) * daysInMonth('2026-11') / novemberDaysCovered;
  const decemberProjectedCCBDiscount = novemberProjectedCCBDiscount * daysInMonth('2026-12') / daysInMonth('2026-11');
  const ccbDiscountProjected2026 = ccbDiscountsJanToOct + novemberProjectedCCBDiscount + decemberProjectedCCBDiscount;
  const defragActualThroughApril = ['2026-01', '2026-02', '2026-03', '2026-04']
    .reduce((sum, month) => sum + (decemberCCBNet - ccbDiscountByMonth[month].ccbGross), 0);
  const s3ImplementationCost = -671;
  const benefitActualThroughNovember = defragActualThroughApril + ccbDiscountActualThroughNovember + s3ImplementationCost;
  const projectedBenefits2026 = defragActualThroughApril + ccbDiscountProjected2026 + s3ImplementationCost;

  const growthChart = {
    labels: yearRows.map(row => monthLabel(row.month)),
    datasets: [
      {
        label: 'Backup storage (Jan = 100)',
        data: yearRows.map(row => row.backupGB !== null && janStorage ? (row.backupGB / janStorage) * 100 : null),
        borderColor: '#58a6ff',
        backgroundColor: 'rgba(88,166,255,.12)',
        tension: 0.25,
        pointRadius: 3,
        spanGaps: false,
      },
      {
        label: 'Backup cost (Jan = 100)',
        data: yearRows.map(row => row.backupCost !== null && janCost ? (row.backupCost / janCost) * 100 : null),
        borderColor: '#3fb950',
        backgroundColor: 'rgba(63,185,80,.08)',
        tension: 0.25,
        pointRadius: 3,
        spanGaps: false,
      },
    ],
  };
  const timeline = [
    { date: 'Aug 2025', detail: 'First discussion about moving backups to S3.', color: '#58a6ff' },
    { date: 'Dec 2025', detail: 'Defragmentation to reduce backup storage.', color: '#d29922' },
    { date: 'Jan 2026', detail: '20% Continuous Cloud Backup discount applied.', color: '#3fb950' },
    { date: 'Feb–Apr 2026', detail: 'S3 migration testing.', color: '#bc8cff' },
    { date: 'May 2026', detail: 'S3 migration started.', color: '#e3934b' },
    { date: 'Sep 5, 2026', detail: 'Backup policies reverted to Atlas.', color: '#f85149' },
  ];

  return (
    <div>
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Implementation timeline</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 0 }}>
          {timeline.map((item, index) => (
            <div key={item.date} style={{ padding: '12px 14px', borderTop: `2px solid ${item.color}`, borderRight: index < timeline.length - 1 ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 6 }}>{item.date}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>2025 backup growth</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 }}>
          January to December invoice comparison. June has no invoice data and is left blank.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Backup storage growth', value: fmtPercent(storageGrowth), detail: `${janStorage.toLocaleString()} → ${decStorage.toLocaleString()} GB` },
            { label: 'Atlas backup cost growth', value: fmtPercent(costGrowth), detail: `${fmtCurrency(janCost)} → ${fmtCurrency(decCost)}` },
          ].map(metric => (
            <div key={metric.label} style={{ background: 'var(--surface2)', borderRadius: 6, padding: 16, borderTop: '3px solid var(--accent)' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{metric.label}</div>
              <strong style={{ display: 'block', fontSize: 24, color: 'var(--text)', lineHeight: 1.2 }}>{metric.value}</strong>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{metric.detail}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 320 }}>
          <ChartWrapper type="line" data={growthChart as never} height={320} options={{
            plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${Number(context.raw).toFixed(1)}` } } },
            scales: {
              y: { title: { display: true, text: 'Index (Jan 2025 = 100)' }, grid: { color: '#21262d' } },
              x: { grid: { display: false } },
            },
          } as never} />
        </div>
        <div className="scr" style={{ overflowX: 'auto', marginTop: 18 }}>
          <table style={{ minWidth: 620, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {['Month', 'Backup Storage', 'Atlas Backup Cost'].map((label, index) => (
                  <th key={label} style={{ textAlign: index === 0 ? 'left' : 'right', whiteSpace: 'normal', lineHeight: 1.35, verticalAlign: 'bottom', padding: '10px 8px', overflowWrap: 'anywhere' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearRows.map(row => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td>{row.backupGB === null ? 'No invoice data' : `${row.backupGB.toLocaleString()} GB`}</td>
                  <td>{row.backupCost === null ? 'No invoice data' : fmtCurrency(row.backupCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>December defragmentation and CCB discount impact</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            <div style={{ borderLeft: '3px solid #d29922', padding: '8px 12px', background: 'var(--surface2)' }}>
              <strong style={{ fontSize: 12, color: 'var(--text)' }}>December 2025</strong>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Backup defragmentation was performed.</div>
            </div>
            <div style={{ borderLeft: '3px solid #3fb950', padding: '8px 12px', background: 'var(--surface2)' }}>
              <strong style={{ fontSize: 12, color: 'var(--text)' }}>January 2026 onward</strong>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>A 20% CCB backup discount was applied.</div>
            </div>
          </div>
        </div>
        <div className="scr" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 1260, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {[
                  'Month',
                  'Projected Backup Storage',
                  'Actual Backup Storage',
                  'Backup Storage vs Dec',
                  'Projected Backup Cost',
                  'Actual Backup Cost',
                  'Defrag / Storage Cost Reduction',
                  'CCB Discount',
                  'Total Reduction vs Dec',
                ].map((label, index) => (
                  <th key={label} style={{ textAlign: index === 0 ? 'left' : 'right', whiteSpace: 'normal', lineHeight: 1.35, verticalAlign: 'bottom', padding: '10px 8px', overflowWrap: 'anywhere' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changeRows.map(row => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td>{row.projectedBackupGB.toLocaleString()} GB</td>
                  <td>{row.actualBackupGB.toLocaleString()} GB</td>
                  <td>{Math.abs(row.storageVsDecember).toLocaleString()} GB {row.storageVsDecember >= 0 ? 'lower' : 'higher'}</td>
                  <td>{fmtCurrency(row.projectedBackupCost)}</td>
                  <td>{fmtCurrency(row.actualBackupCost)}</td>
                  <td>{fmtCurrency(row.defragStorageReduction)}</td>
                  <td>{fmtCurrency(row.ccbDiscount)}</td>
                  <td>{fmtCurrency(row.totalReduction)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}><strong>Jan–Apr sum</strong></td>
                <td style={{ textAlign: 'right' }}>—</td>
                <td style={{ textAlign: 'right' }}>—</td>
                <td style={{ textAlign: 'right' }}>—</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrency(changeTotals.projectedBackupCost)}</strong></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrency(changeTotals.actualBackupCost)}</strong></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrency(changeTotals.defragStorageReduction)}</strong></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrency(changeTotals.ccbDiscount)}</strong></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrency(changeTotals.totalReduction)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '10px 20px 14px', color: 'var(--text2)', fontSize: 11, lineHeight: 1.6 }}>
          Projected Backup Storage uses December 2025 as the no-defrag reference; Actual Backup Storage is from each invoice month. Projected Backup Cost = Actual Backup Cost + estimated defrag/storage reduction + CCB discount. Footer cost values are arithmetic Jan–Apr sums; the reductions use the same December reference each month and should not be read as a separate lifetime cumulative saving. Actual Backup Cost is the Atlas invoice total and excludes customer S3 bills.
        </div>
      </section>

      <S3ImplementationCostReview data={data} compactCostHeaders />

      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>2025 vs 2026 Backup Cost Comparison</h2>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>January–December comparison. November and December 2026 use the {novemberPeriodLabel} run rate; September onward excludes unavailable customer S3 charges.</p>
        </div>
        <div className="scr" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 800, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '34%' }} />
              <col style={{ width: '34%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.35, padding: '10px 8px' }}>Month</th>
                <th style={{ textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.35, padding: '10px 8px' }}>2025 Backup Cost</th>
                <th style={{ textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.35, padding: '10px 8px' }}>2026 Backup Cost</th>
                <th style={{ textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.35, padding: '10px 8px' }}>2026 Backup Cost<br />Without S3 Implementation</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(row => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td style={{ textAlign: 'right', color: '#58a6ff' }}>{fmtCurrencyExact(row.backupCost2025)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: row.month === '2026-09' || row.month === '2026-10' || !row.incomplete ? '#3fb950' : 'var(--orange)', whiteSpace: 'nowrap' }}>{fmtCurrencyExact(row.backupCost2026)}{row.incomplete ? '*' : ''}</div>
                    <div style={{ marginTop: 2, color: row.month === '2026-09' || row.month === '2026-10' ? 'var(--text2)' : row.incomplete ? 'var(--orange)' : 'var(--text2)', fontSize: 10, whiteSpace: 'nowrap' }}>{row.basis}</div>
                  </td>
                  <td style={{ textAlign: 'right', color: '#d29922' }}>{fmtCurrencyExact(row.backupCostWithoutS3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ textAlign: 'left' }}><strong>Jan–Dec total*</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{fmtCurrencyExact(comparisonTotals.backupCost2025)}</strong></td>
                <td style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block' }}>{fmtCurrencyExact(comparisonTotals.backupCost2026)}*</strong>
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--orange)', fontSize: 10 }}>Mixed actual / projected*</span>
                </td>
                <td style={{ textAlign: 'right', color: '#d29922' }}><strong>{fmtCurrencyExact(comparisonTotals.backupCostWithoutS3)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ padding: '18px 20px 8px', borderTop: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Spend and identified savings</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, background: 'var(--border)' }}>
          {[
            { category: 'HISTORICAL', accent: '#58a6ff', label: '2025 full-year backup spend', value: fmtCurrency(backupSpend2025), detail: 'Atlas invoice totals, Jan–Dec' },
            { category: 'ACTUAL TO NOV 14', accent: '#3fb950', label: `2026 known spend to ${novemberPeriodLabel}`, value: fmtCurrency(knownBackupSpendToNovember), detail: 'Atlas invoices + supplied S3 estimates' },
            { category: 'PROJECTED', accent: 'var(--orange)', label: '2026 known spend projected to Dec 31', value: fmtCurrency(projectedBackupSpend2026), detail: 'Nov run rate for the rest of Nov and Dec' },
            { category: 'NO-S3 COMPARISON', accent: '#d29922', label: '2026 backup cost without S3 implementation', value: fmtCurrency(comparisonTotals.backupCostWithoutS3), detail: 'Sum of the comparison column, Jan–Dec' },
          ].map(metric => (
            <div key={metric.label} style={{ background: 'var(--surface)', padding: '12px 14px 14px', borderTop: `2px solid ${metric.accent}`, minWidth: 0 }}>
              <div style={{ color: metric.accent, fontSize: 10, fontWeight: 700, marginBottom: 9 }}>{metric.category}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, minHeight: 31 }}>{metric.label}</div>
              <strong style={{ display: 'block', marginTop: 4, fontSize: 20, lineHeight: 1.2, color: 'var(--text)', whiteSpace: 'nowrap' }}>{metric.value}</strong>
              <span style={{ display: 'block', marginTop: 7, color: 'var(--text2)', fontSize: 11, lineHeight: 1.4 }}>{metric.detail}</span>
            </div>
          ))}
        </div>
        <div className="scr" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 650, tableLayout: 'fixed' }}>
            <thead>
              <tr><th style={{ textAlign: 'left' }}>Benefit</th><th>Actual / identified So Far</th><th>2026 projection</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Defragmentation / storage reduction (Jan–Apr only)</td>
                <td style={{ color: 'var(--green)' }}>{fmtCurrencyExact(defragActualThroughApril)}</td>
                <td style={{ color: 'var(--green)' }}>{fmtCurrencyExact(defragActualThroughApril)}</td>
              </tr>
              <tr>
                <td>CCB discount savings</td>
                <td style={{ color: 'var(--green)' }}>{fmtCurrencyExact(ccbDiscountActualThroughNovember)}</td>
                <td style={{ color: 'var(--green)' }}>{fmtCurrencyExact(ccbDiscountProjected2026)}</td>
              </tr>
              <tr>
                <td>S3 implementation cost</td>
                <td style={{ color: 'var(--red)' }}>{fmtCurrencyExact(s3ImplementationCost)}</td>
                <td style={{ color: 'var(--red)' }}>{fmtCurrencyExact(s3ImplementationCost)}</td>
              </tr>
              <tr>
                <td>December benefit yet to be realized</td>
                <td>—</td>
                <td style={{ color: 'var(--text2)' }}>Yet to be realized</td>
              </tr>
              <tr className="totals-row">
                <td><strong>Net benefits identified / projected</strong></td>
                <td style={{ color: 'var(--green)' }}><strong>{fmtCurrencyExact(benefitActualThroughNovember)}</strong></td>
                <td style={{ color: 'var(--green)' }}><strong>{fmtCurrencyExact(projectedBenefits2026)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 20px 16px', color: 'var(--text2)', fontSize: 11, lineHeight: 1.6 }}>
          Defragmentation savings are identified only through April; the 2026 column carries that amount without annualizing it. The {fmtCurrencyExact(s3ImplementationCost)} S3 implementation cost is deducted in both actual and projected net benefits. CCB discount projection uses the {novemberPeriodLabel} daily rate for the rest of November and December. December benefits are yet to be realized. 2026 spend projections exclude customer S3 charges not supplied for September onward.
        </div>
      </section>
      <section style={{ padding: '24px 20px 28px', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>Storage, Retention &amp; Cost Decisions</h2>
        <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
          {[
            { title: 'Glacier vs. standard S3 storage' },
            { title: 'Hourly vs. weekly copy cadence to S3' },
            { title: '7-day vs. 10-day Atlas CCB backup retention' },
            { title: 'Plan for data and backup-storage growth under each retention policy' },
          ].map((item, index) => (
            <li key={item.title} style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 12, alignItems: 'start', padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(index + 1).padStart(2, '0')}</span>
              <div style={{ color: 'var(--text)', fontSize: 16, lineHeight: 1.45 }}>{item.title}</div>
            </li>
          ))}
          <li style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 12, alignItems: 'start', padding: '13px 0' }}>
            <span style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>05</span>
            <div>
              <div style={{ color: 'var(--text)', fontSize: 16, lineHeight: 1.45 }}>Cost optimization options</div>
              <ol type="a" style={{ margin: '8px 0 0', paddingLeft: 22, color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
                <li>Retention policy changes.</li>
                <li>Data purging during initial sync and defragmentation. This carries risk from unoptimized queries and indexes, may require scaling up, and needs a customer decision.</li>
              </ol>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}