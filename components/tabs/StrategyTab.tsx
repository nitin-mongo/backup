'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

export default function StrategyTab({ data }: Props) {
  const { whatIfTotal: wi, projection: P } = data;
  const S3 = P.s3Summary;

  const scenarios = [
    { l: "Pre-Opt Avg\n(Jul-Dec '25)", v: 148065, c: '#8b949e' },
    { l: 'Hypothetical\n(Old Policy Today)', v: 201976, c: '#f85149' },
    { l: 'Current Jun\n(Atlas Only)', v: 110059, c: '#58a6ff' },
    { l: 'Current Jun\n(Fully Loaded)', v: 110059 + S3.junS3Cost, c: '#d29922' },
    { l: 'Option A\nWeekly S3', v: 67383, c: '#3fb950' },
    { l: '⚠ 30d Atlas\n+Monthly S3', v: 162322, c: '#f85149' },
  ];

  const chartData = {
    labels: scenarios.map(s => s.l),
    datasets: [{
      data: scenarios.map(s => s.v),
      backgroundColor: scenarios.map(s => s.c + '99'),
      borderColor: scenarios.map(s => s.c),
      borderWidth: 2,
    }],
  };

  const options = [
    {
      title: 'Option A: Weekly S3 Exports (Best Savings)',
      tag: 'Save ~$50K/mo',
      tagGood: true,
      text: 'Keep 10-day Atlas retention. Reduce S3 exports from daily to weekly. Atlas CCB stays ~$58K, export charges drop to ~$7K. AWS S3 storage drops to ~$1.8K. Fully loaded: ~$67K/mo.',
    },
    {
      title: 'Option B: Selective Daily Export (Top 5)',
      tag: 'Save ~$27K/mo',
      tagGood: true,
      text: 'Keep daily exports only for top 5 clusters (58% of cost). Stop exports for 22 smaller clusters. Saves $27K/mo while protecting critical data.',
    },
    {
      title: 'Option C: Weekly + S3 Intelligent Tiering',
      tag: 'Save ~$55K/mo',
      tagGood: true,
      text: 'Weekly exports + S3 Intelligent-Tiering for older snapshots. Best if long-term retention is required for compliance.',
    },
    {
      title: '⚠ Avoid: 30-Day Atlas Retention',
      tag: '+$45K/mo',
      tagGood: false,
      text: 'Tripling Atlas retention adds ~$101K/mo in Tier 4 storage, far exceeding export savings. Break-even needs 198+ S3 copies.',
    },
  ];

  return (
    <div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Finding: The Optimization IS Working — But S3 Export Costs Erode the Gains</h3>
        <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.8, marginTop: 8 }}>
          Pre-optimization (Jul–Dec &apos;25) backup costs averaged <strong style={{ color: 'var(--text)' }}>$148K/mo</strong> with a 4.2× ratio.
          Post-optimization (Jun &apos;26) CCB dropped 60% to <strong className="pos">$58K</strong> — but S3 exports added <strong className="warn">$51K</strong> on Atlas +{' '}
          <strong className="warn">~$8K</strong> on AWS, bringing fully-loaded total to <strong style={{ color: 'var(--text)' }}>$118K</strong>.
          Still 20% lower than pre-optimization. The path to further savings: reduce export frequency.
        </p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Scenario Comparison — Projected Monthly Costs</div>
        <ChartWrapper type="bar" data={chartData} height={350} options={{
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => fmt(c.raw as number) + '/mo' } }
          },
          scales: {
            y: { ticks: { callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } },
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } }
          }
        }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {options.map((o, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>
              {o.title}
              <span style={{
                display: 'inline-block',
                background: o.tagGood ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
                color: o.tagGood ? 'var(--green)' : 'var(--red)',
                padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, marginLeft: 8
              }}>{o.tag}</span>
            </h4>
            <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{o.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
