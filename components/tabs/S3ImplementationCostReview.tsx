'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { daysInMonth, monthLabel } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });
const fmtCurrencyExact = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const fmtCurrencyWhole = (value: number) => '$' + Math.round(value).toLocaleString('en-US');
const fmtCurrencySigned = (value: number) => `${value > 0 ? '+' : ''}${fmtCurrencyExact(value)}`;
const fmtCurrencySignedWhole = (value: number) => value < 0 ? `-${fmtCurrencyWhole(Math.abs(value))}` : `${value > 0 ? '+' : ''}${fmtCurrencyWhole(value)}`;
const fmtCurrencyTruncated = (value: number) => '$' + Math.trunc(value).toLocaleString('en-US');

export function getProjectedBaselineCosts(data: DashboardData): Record<string, number> {
  const { monthly_totals: mt } = data;
  const baselineMonths = ['2026-02', '2026-03', '2026-04'];
  const baselineFebStorage = mt['2026-02']?.avgBackupGB || 0;
  const baselineAprStorage = mt['2026-04']?.avgBackupGB || 0;
  const baselineStorageGrowth = (baselineAprStorage - baselineFebStorage) / 2;
  const baselineCostTotal = baselineMonths.reduce((sum, month) =>
    sum + (mt[month]?.total || 0) - (mt[month]?.totalExport || 0), 0);
  const baselineStorageTotal = baselineMonths.reduce((sum, month) => sum + (mt[month]?.avgBackupGB || 0), 0);
  const baselineCostPerGB = baselineStorageTotal > 0 ? baselineCostTotal / baselineStorageTotal : 0;
  const costs: Record<string, number> = {
    '2026-01': (mt['2026-01']?.total || 0) - (mt['2026-01']?.totalExport || 0),
  };

  baselineMonths.forEach(month => {
    costs[month] = (mt[month]?.total || 0) - (mt[month]?.totalExport || 0);
  });
  for (let monthNumber = 5; monthNumber <= 12; monthNumber += 1) {
    const projectedStorage = baselineAprStorage + baselineStorageGrowth * (monthNumber - 4);
    costs[`2026-${String(monthNumber).padStart(2, '0')}`] = projectedStorage * baselineCostPerGB;
  }
  return costs;
}

export const customerS3ChartTotals: Record<string, number> = {
  '2026-05': 187063,
  '2026-06': 124696,
  '2026-07': 132158,
  '2026-08': 135185,
};
const baselineSpendChartTotal = 122744;

interface Props {
  data: DashboardData;
  compactCostHeaders?: boolean;
}

export function getS3ImplementationReview(data: DashboardData) {
  const { monthly_totals: mt } = data;
  const noDefragReferenceStorage = mt['2025-12']?.avgBackupGB || 0;
  const projectedBaselineCosts = getProjectedBaselineCosts(data);
  const baselineMonths = ['2026-02', '2026-03', '2026-04'];
  const baselineFebStorage = mt['2026-02']?.avgBackupGB || 0;
  const baselineAprStorage = mt['2026-04']?.avgBackupGB || 0;
  const baselineStorageGrowth = (baselineAprStorage - baselineFebStorage) / 2;
  const baselineCostTotal = baselineMonths.reduce((sum, month) =>
    sum + (mt[month]?.total || 0) - (mt[month]?.totalExport || 0), 0);
  const baselineStorageTotal = baselineMonths.reduce((sum, month) => sum + (mt[month]?.avgBackupGB || 0), 0);
  const baselineCostPerGB = baselineStorageTotal > 0 ? baselineCostTotal / baselineStorageTotal : 0;
  const baselineCCB = baselineMonths.reduce((sum, month) => sum + (mt[month]?.ccb || 0), 0) / baselineMonths.length;
  const baselineOtherBackup = baselineMonths.reduce((sum, month) => sum + (mt[month]?.cloudBackup || 0), 0) / baselineMonths.length;
  const baselineExport = baselineMonths.reduce((sum, month) => sum + (mt[month]?.totalExport || 0), 0) / baselineMonths.length;
  const spendChartRows = [
    { month: 'Baseline (Feb–Apr avg)', ccb: baselineCCB, other: baselineOtherBackup, export: baselineExport, total: baselineSpendChartTotal },
    ...['2026-05', '2026-06', '2026-07', '2026-08'].map(month => ({
      month: monthLabel(month),
      ccb: mt[month]?.ccb || 0,
      other: mt[month]?.cloudBackup || 0,
      export: mt[month]?.totalExport || 0,
      total: customerS3ChartTotals[month],
    })),
  ].map(row => ({ ...row, customerS3: row.total - row.ccb - row.other - row.export }));
  const spendChartData = {
    labels: spendChartRows.map(row => row.month),
    datasets: [
      { label: 'Continuous Backup Storage (the real saving)', data: spendChartRows.map(row => row.ccb), backgroundColor: '#242a66', stack: 'cost' },
      { label: 'Other Backup Storage', data: spendChartRows.map(row => row.other), backgroundColor: '#91b4e5', stack: 'cost' },
      { label: 'S3 Export fee (Atlas) — new cost', data: spendChartRows.map(row => row.export), backgroundColor: '#e3934b', stack: 'cost' },
      { label: 'AWS S3 bucket storage — new cost', data: spendChartRows.map(row => row.customerS3), backgroundColor: '#9f3b37', stack: 'cost' },
    ],
  };

  const historicalCostRows = baselineMonths.map(month => {
    const actualCost = mt[month]?.total || 0;
    const exportCost = mt[month]?.totalExport || 0;
    return {
      month,
      periodStatus: month === '2026-01' ? 'historical' : 'baseline',
      projectedStorage: noDefragReferenceStorage,
      actualStorage: mt[month]?.avgBackupGB || 0,
      projectedCost: projectedBaselineCosts[month],
      projectedMonthEndActualCost: null,
      atlasActualCost: actualCost,
      actualCost,
      customerS3Cost: null,
      exportCost,
      variance: actualCost - (actualCost - exportCost),
      atlasOnlySavings: null,
    };
  });

  const implementationCostRows = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((month, index) => {
    const projectedStorage = baselineAprStorage + baselineStorageGrowth * (index + 1);
    const projectedCost = projectedStorage * baselineCostPerGB;
    const atlasActualCost = mt[month]?.total || 0;
    const chartTotal = customerS3ChartTotals[month];
      const customerS3Cost = chartTotal === undefined ? null : chartTotal - atlasActualCost;
    const actualCost = chartTotal ?? atlasActualCost;
    const variance = customerS3Cost === null
      ? month === '2026-09' ? atlasActualCost - projectedCost : null
      : actualCost - projectedCost;
    return {
      month,
      periodStatus: month === '2026-09' ? 'rollback' : 'observed',
      projectedStorage,
      actualStorage: mt[month]?.avgBackupGB || 0,
      projectedCost: projectedBaselineCosts[month],
      projectedMonthEndActualCost: null,
      atlasActualCost,
      actualCost,
      customerS3Cost,
      exportCost: mt[month]?.totalExport || 0,
      variance,
      atlasOnlySavings: null,
    };
  });

  const octoberProjectedStorage = baselineAprStorage + baselineStorageGrowth * 6;
  const octoberAtlasActual = mt['2026-10']?.total ?? null;
  const octoberActualRow = {
    month: '2026-10',
    periodStatus: 'atlasOnly',
    projectedStorage: octoberProjectedStorage,
    actualStorage: mt['2026-10']?.avgBackupGB ?? null,
    projectedCost: projectedBaselineCosts['2026-10'],
    projectedMonthEndActualCost: null,
    atlasActualCost: octoberAtlasActual,
    actualCost: octoberAtlasActual,
    customerS3Cost: null,
    exportCost: mt['2026-10']?.totalExport ?? null,
    variance: octoberAtlasActual === null ? null : octoberAtlasActual - octoberProjectedStorage * baselineCostPerGB,
    atlasOnlySavings: null,
  };
  const novemberDaysCovered = data.partialMonthDays?.['2026-11'] ?? 14;
  const novemberDaysInMonth = daysInMonth('2026-11');
  const novemberActualCost = mt['2026-11']?.total ?? null;
  const novemberProjectedStorage = baselineAprStorage + baselineStorageGrowth * 7;
  const novemberPartialRow = {
    month: '2026-11',
    periodStatus: 'partialForecast',
    projectedStorage: novemberProjectedStorage,
    actualStorage: mt['2026-11']?.avgBackupGB ?? null,
    projectedCost: projectedBaselineCosts['2026-11'],
    projectedMonthEndActualCost: novemberActualCost === null ? null : novemberActualCost * novemberDaysInMonth / novemberDaysCovered,
    atlasActualCost: novemberActualCost,
    actualCost: novemberActualCost,
    customerS3Cost: null,
    exportCost: mt['2026-11']?.totalExport ?? null,
    variance: novemberActualCost === null ? null : novemberActualCost * novemberDaysInMonth / novemberDaysCovered - novemberProjectedStorage * baselineCostPerGB,
    atlasOnlySavings: null,
  };
  const decemberProjectedStorage = baselineAprStorage + baselineStorageGrowth * 8;
  const decemberProjectedRow = {
    month: '2026-12',
    periodStatus: 'forecast',
    projectedStorage: decemberProjectedStorage,
    actualStorage: null,
    projectedCost: projectedBaselineCosts['2026-12'],
    projectedMonthEndActualCost: null,
    atlasActualCost: null,
    actualCost: null,
    customerS3Cost: null,
    exportCost: null,
    variance: null,
    atlasOnlySavings: null,
  };
  const reviewRows = [...historicalCostRows, ...implementationCostRows, octoberActualRow, novemberPartialRow, decemberProjectedRow];
  const totalThroughNovember = reviewRows
    .filter(row => row.month >= '2026-05' && row.month <= '2026-11')
    .reduce((totals, row) => ({
      projectedCost: totals.projectedCost + row.projectedCost,
      projectedMonthEndActualCost: totals.projectedMonthEndActualCost + (row.projectedMonthEndActualCost || 0),
      atlasInvoiceCost: totals.atlasInvoiceCost + (row.atlasActualCost || 0),
      customerS3Cost: totals.customerS3Cost + (row.customerS3Cost || 0),
      exportCost: totals.exportCost + (row.exportCost || 0),
      actualCost: totals.actualCost + (row.actualCost || 0),
      variance: totals.variance + (row.variance ?? row.atlasOnlySavings ?? 0),
    }), { projectedCost: 0, projectedMonthEndActualCost: 0, atlasInvoiceCost: 0, customerS3Cost: 0, exportCost: 0, actualCost: 0, variance: 0 });
  const varianceTotalFebruaryToNovember = reviewRows
    .filter(row => row.month >= '2026-02' && row.month <= '2026-11')
    .reduce((total, row) => total + Math.trunc(row.variance || 0), 0);

  return { mt, baselineMonths, baselineStorageGrowth, baselineCostPerGB, spendChartData, spendChartRows, reviewRows, novemberDaysCovered, totalThroughNovember, varianceTotalFebruaryToNovember };
}

export default function S3ImplementationCostReview({ data, compactCostHeaders = false }: Props) {
  const { mt, baselineMonths, baselineStorageGrowth, baselineCostPerGB, spendChartData, spendChartRows, reviewRows, novemberDaysCovered, totalThroughNovember, varianceTotalFebruaryToNovember } = getS3ImplementationReview(data);
  const columnWidths = compactCostHeaders
    ? ['7%', '12%', '12%', '13%', '12%', '10%', '8%', '7%', '9%', '10%']
    : ['7%', '11%', '11%', '11%', '10%', '9%', '8%', '8%', '14%', '11%'];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>S3 Implementation Cost Review</h3>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          February–April defines the cost and storage baseline. October is a full invoice month; November actuals cover Nov 1–{novemberDaysCovered} with a 30-day run-rate estimate.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 1, background: 'var(--border)' }}>
        {[
          ...baselineMonths.map(month => ({
            label: `${monthLabel(month)} baseline (excl. export)`,
            value: fmtCurrencyExact((mt[month]?.total || 0) - (mt[month]?.totalExport || 0)),
          })),
          { label: 'Backup storage growth', value: `+${Math.round(baselineStorageGrowth).toLocaleString()} GB / month` },
          { label: 'Weighted baseline rate', value: `$${baselineCostPerGB.toFixed(4)} / GB-month` },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--surface)', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{item.label}</div>
            <strong style={{ fontSize: 14, color: 'var(--text)' }}>{item.value}</strong>
          </div>
        ))}
      </div>
      <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Step 2: Where the money actually went each month</h4>
        <div style={{ height: 380 }}>
          <ChartWrapper type="bar" data={spendChartData as never} height={380} options={{
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, padding: 14 } },
              tooltip: { callbacks: { label: context => `${context.dataset.label}: ${fmtCurrencyExact(Number(context.raw))}` } },
            },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Monthly cost (USD, August scaled to full month)' }, ticks: { callback: value => '$' + (Number(value) / 1000).toFixed(0) + 'k' }, grid: { color: '#30363d' } },
            },
          } as never} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', borderTop: '1px solid var(--border)' }}>
          {spendChartRows.map(row => (
            <div key={row.month} style={{ textAlign: 'center', padding: '10px 4px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{row.month}</div>
              <strong style={{ fontSize: 12, color: 'var(--text)' }}>{fmtCurrencyWhole(row.total)}</strong>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, marginTop: 8 }}>
          Customer S3 portions are derived from the image's rounded monthly totals after subtracting Atlas invoice categories. August uses the customer's 14-day ×2.2 scaling.
        </p>
      </div>
      <div className="scr" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: compactCostHeaders ? 1300 : 1450, tableLayout: 'fixed' }}>
          <colgroup>
            {columnWidths.map((width, index) => <col key={index} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              {['Month', 'Projected Backup Storage', 'Actual / MTD Backup Storage', 'Projected Baseline Cost', 'Projected Actual Cost', 'Atlas Invoice Cost', 'Atlas S3 Export', 'Customer S3 Cost', 'Total Actual Backup Cost', 'Actual vs Baseline'].map((label, index) => (
                <th key={label} style={{ textAlign: index === 0 ? 'left' : 'right', whiteSpace: 'normal', lineHeight: 1.35, verticalAlign: 'bottom', padding: compactCostHeaders && (index === 7 || index === 8) ? '10px 2px' : '10px 8px' }}>
                  {compactCostHeaders && label === 'Projected Baseline Cost' ? <>Projected<br />Baseline Cost</>
                    : compactCostHeaders && label === 'Projected Actual Cost' ? <>Projected<br />Actual Cost</>
                    : compactCostHeaders && label === 'Atlas Invoice Cost' ? <>Atlas Invoice<br />Cost</>
                    : compactCostHeaders && label === 'Atlas S3 Export' ? <>Atlas S3<br />Export</>
                    : compactCostHeaders && label === 'Customer S3 Cost' ? <>Customer S3<br />Cost</>
                    : compactCostHeaders && label === 'Total Actual Backup Cost' ? <>Total<br />Backup Cost</>
                    : compactCostHeaders && label === 'Actual vs Baseline' ? <>Actual vs<br />Baseline</>
                    : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reviewRows.map(row => (
              <tr key={row.month} style={row.month === '2026-05' ? { borderTop: '3px solid #f85149' } : undefined}>
                <td>{monthLabel(row.month)}</td>
                <td>{row.projectedStorage === null ? '—' : `${Math.round(row.projectedStorage).toLocaleString()} GB`}</td>
                <td>{row.actualStorage === null ? '—' : `${Math.round(row.actualStorage).toLocaleString()} GB`}</td>
                <td>{row.projectedCost === null ? '—' : fmtCurrencyExact(row.projectedCost)}</td>
                <td>{row.projectedMonthEndActualCost === null ? '—' : `${fmtCurrencyExact(row.projectedMonthEndActualCost)}*`}</td>
                <td>{row.atlasActualCost === null ? 'Pending invoice' : `${fmtCurrencyWhole(row.atlasActualCost)}${row.customerS3Cost === null && ['rollback', 'atlasOnly', 'partialForecast'].includes(row.periodStatus) ? '*' : ''}`}</td>
                <td>{row.exportCost === null ? '—' : fmtCurrencyExact(row.exportCost)}</td>
                <td style={compactCostHeaders ? { paddingLeft: 2, paddingRight: 2 } : undefined}>{row.customerS3Cost !== null ? fmtCurrencyExact(row.customerS3Cost) : '—'}</td>
                <td style={compactCostHeaders ? { paddingLeft: 2, paddingRight: 2 } : undefined}>{row.actualCost === null ? 'Pending invoice' : `${fmtCurrencyWhole(row.actualCost)}${row.customerS3Cost === null && ['rollback', 'atlasOnly', 'partialForecast'].includes(row.periodStatus) ? '*' : ''}`}</td>
                <td style={{ color: row.variance !== null && row.variance > 0 ? 'var(--red)' : 'var(--green)' }}>{row.variance !== null ? fmtCurrencyTruncated(Math.abs(row.variance)) : row.periodStatus === 'baseline' ? 'Baseline' : row.periodStatus === 'historical' ? 'Historical' : row.periodStatus === 'forecast' ? 'Forecast only' : row.periodStatus === 'atlasOnly' ? '—' : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}><strong>Total</strong></td>
              <td style={{ textAlign: 'right' }}>—</td>
              <td style={{ textAlign: 'right' }}>—</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrencyExact(totalThroughNovember.projectedCost)}</strong></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrencyExact(totalThroughNovember.projectedMonthEndActualCost)}</strong></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrencyWhole(totalThroughNovember.atlasInvoiceCost)}</strong></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrencyExact(totalThroughNovember.exportCost)}</strong></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrencyExact(totalThroughNovember.customerS3Cost)}*</strong></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtCurrencyWhole(totalThroughNovember.actualCost)}</strong></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong style={{ color: varianceTotalFebruaryToNovember > 0 ? 'var(--red)' : 'var(--green)' }}>{fmtCurrencyTruncated(Math.abs(varianceTotalFebruaryToNovember))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ padding: '10px 20px 14px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
        Other Total-row amounts cover May–November; Actual vs Baseline nets February–November variances (positive red, negative green). November actual cost is through {`Nov 1–${novemberDaysCovered}`}, with projected actual estimated to a full month. Customer S3 charges for September–November are excluded. The red divider marks the S3 implementation start in May.
      </div>
    </div>
  );
}