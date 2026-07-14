'use client';

import dynamic from 'next/dynamic';
import { DashboardData } from '@/lib/types';
import { fmt, fmtGB } from '@/lib/formatters';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

export default function ProjectionTab({ data }: Props) {
  const { projection: P } = data;
  const J = P.june, JP = P.julyProjected;
  const S3 = P.s3Summary;

  const comps = [
    { name: 'Continuous Cloud Backup', jn: J.ccb, jl: JP.ccb, color: '#58a6ff' },
    { name: 'Cloud Backup', jn: J.cloudBackup, jl: JP.cloudBackup, color: '#bc8cff' },
    { name: 'S3 Export — Upload', jn: J.exportUpload, jl: JP.exportUpload, color: '#d29922' },
    { name: 'S3 Export — Restore Storage', jn: J.exportRestore, jl: JP.exportRestore, color: '#e3b341' },
    { name: 'S3 Export — Download VM', jn: J.exportVM, jl: JP.exportVM, color: '#f0c75e' },
    { name: 'S3 Export — Storage IOPS', jn: J.exportIOPS, jl: JP.exportIOPS, color: '#c9a227' },
  ];

  const junExport = J.totalExport, julExport = JP.totalExport;
  const junT = J.total, julT = JP.total;
  const junFL = junT + S3.junS3Cost, julFL = julT + S3.julS3Cost;

  const chartData = {
    labels: comps.map(c => c.name.replace('S3 Export — ', '')),
    datasets: [
      { label: 'June (Actual)', data: comps.map(c => c.jn), backgroundColor: 'rgba(88,166,255,.7)', borderColor: '#58a6ff', borderWidth: 1 },
      { label: 'July (Projected)', data: comps.map(c => c.jl), backgroundColor: 'rgba(63,185,80,.7)', borderColor: '#3fb950', borderWidth: 1 },
    ],
  };

  // Per-cluster projection table
  const cJun: Record<string, { ccb: number; exp: number; total: number }> = {};
  const cJul: Record<string, { ccb: number; exp: number; total: number }> = {};
  data.clusters.forEach(c => {
    const jn = c.months['2026-06'] || {} as ReturnType<() => typeof c.months[string]>;
    const jl = c.months['2026-07'] || {} as ReturnType<() => typeof c.months[string]>;
    const jnCcb = (jn as Record<string, number>).ccb || 0;
    const jnExp = (jn as Record<string, number>).totalExport || 0;
    const jnT = (jn as Record<string, number>).total || 0;
    const jlCcb = ((jl as Record<string, number>).ccb || 0) / 12 * 31;
    const jlExp = ((jl as Record<string, number>).totalExport || 0) / 12 * 31;
    const jlT = jlCcb + jlExp + ((jl as Record<string, number>).cloudBackup || 0) / 12 * 31;
    cJun[c.name] = { ccb: jnCcb, exp: jnExp, total: jnT };
    cJul[c.name] = { ccb: jlCcb, exp: jlExp, total: jlT };
  });

  const cList = data.clusters
    .filter(c => (cJun[c.name]?.total || 0) > 50 || (cJul[c.name]?.total || 0) > 50)
    .sort((a, b) => (cJul[b.name]?.total || 0) - (cJul[a.name]?.total || 0));

  let ptJunT = 0, ptJulT = 0;
  cList.forEach(c => { ptJunT += cJun[c.name]?.total || 0; ptJulT += cJul[c.name]?.total || 0; });

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Atlas comparison */}
        <Card title="June 2026 vs July 2026 — Atlas Charges" sub="July projected from 12 days of data (Jul 1–12), extrapolated to 31 days.">
          <div style={{ marginBottom: 8 }}>
            {['Component', 'June (Actual)', 'July (31d Proj)', 'Delta'].map((h, i) => (
              <span key={i} style={{ display: 'inline-block', width: i === 0 ? '40%' : '20%', fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 600 }}>{h}</span>
            ))}
          </div>
          {comps.map(c => {
            const d = c.jl - c.jn;
            const dp = c.jn > 0 ? ((d / c.jn) * 100).toFixed(0) : '—';
            return (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div style={{ flex: 2 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c.color, marginRight: 8 }} />
                  {c.name}
                </div>
                <div style={{ flex: 1, textAlign: 'right', color: 'var(--text)' }}>{fmt(c.jn)}</div>
                <div style={{ flex: 1, textAlign: 'right', color: 'var(--text)' }}>{fmt(c.jl)}</div>
                <div style={{ flex: 1, textAlign: 'right', color: d >= 0 ? 'var(--red)' : 'var(--green)' }}>{d >= 0 ? '+' : ''}{fmt(d)} ({dp}%)</div>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', background: 'var(--surface2)', margin: '0 -24px', paddingLeft: 24, paddingRight: 24, fontWeight: 600 }}>
            <div style={{ flex: 2 }}>S3 Export Subtotal</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(junExport)}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(julExport)}</div>
            <div style={{ flex: 1, textAlign: 'right', color: julExport >= junExport ? 'var(--red)' : 'var(--green)' }}>{julExport >= junExport ? '+' : ''}{fmt(julExport - junExport)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            <div style={{ flex: 2 }}>TOTAL</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(junT)}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(julT)}</div>
            <div style={{ flex: 1, textAlign: 'right', color: julT >= junT ? 'var(--red)' : 'var(--green)' }}>{julT >= junT ? '+' : ''}{fmt(julT - junT)}</div>
          </div>
        </Card>

        {/* Fully loaded */}
        <Card title="Fully Loaded: Atlas + AWS S3" sub="Complete backup cost including estimated AWS S3 storage charges (not on Atlas invoice).">
          {[
            ['Atlas CCB', J.ccb, JP.ccb],
            ['Atlas Cloud Backup', J.cloudBackup, JP.cloudBackup],
            ['Atlas S3 Export Charges', junExport, julExport],
          ].map(([label, jn, jl]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div style={{ flex: 2, color: 'var(--text)' }}>{label as string}</div>
                <div style={{ flex: 1, textAlign: 'right', color: 'var(--text)' }}>{fmt(jn as number)}</div>
                <div style={{ flex: 1, textAlign: 'right', color: 'var(--text)' }}>{fmt(jl as number)}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', background: 'var(--surface2)', margin: '0 -24px', paddingLeft: 24, paddingRight: 24, borderBottom: '2px solid var(--border)', fontWeight: 600 }}>
            <div style={{ flex: 2 }}>Atlas Subtotal</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(junT)}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(julT)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', color: 'var(--orange)', fontSize: 13 }}>
            <div style={{ flex: 2 }}>AWS S3 Storage (est.)</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(S3.junS3Cost)}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(S3.julS3Cost)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
            <div style={{ flex: 2 }}>FULLY LOADED TOTAL</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(junFL)}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>{fmt(julFL)}</div>
          </div>
          <div style={{ textAlign: 'center', padding: 12, background: 'rgba(88,166,255,.08)', border: '1px solid rgba(88,166,255,.3)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>Month-over-Month Change</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: julFL < junFL ? 'var(--green)' : 'var(--red)' }}>
              {julFL < junFL ? '' : '+'}{fmt(julFL - junFL)} ({((julFL - junFL) / junFL * 100).toFixed(1)}%)
            </div>
          </div>
          <p className="note">July daily run-rate: {fmt(julT / 31)}/day vs June: {fmt(junT / 30)}/day.</p>
        </Card>
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>June vs July — Component Comparison</div>
        <ChartWrapper type="bar" data={chartData} height={380} options={{ plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } }, legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { ticks: { callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } }, x: { grid: { display: false } } } }} />
      </div>

      {/* Per-cluster table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Per-Cluster: June Actual vs July Projected</h3>
        </div>
        <div className="scr" style={{ maxHeight: 700 }}>
          <table>
            <thead><tr>
              <th>Cluster</th><th>Jun CCB</th><th>Jun Export</th><th>Jun Total</th>
              <th>Jul CCB*</th><th>Jul Export*</th><th>Jul Total*</th><th>Δ</th>
            </tr></thead>
            <tbody>
              {cList.map(c => {
                const jn = cJun[c.name], jl = cJul[c.name];
                const d = jl.total - jn.total;
                return (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{fmt(jn.ccb)}</td><td>{fmt(jn.exp)}</td><td><strong>{fmt(jn.total)}</strong></td>
                    <td>{fmt(jl.ccb)}</td><td>{fmt(jl.exp)}</td><td><strong>{fmt(jl.total)}</strong></td>
                    <td style={{ color: d >= 0 ? 'var(--red)' : 'var(--green)' }}>{d >= 0 ? '+' : ''}{fmt(d)}</td>
                  </tr>
                );
              })}
              <tr className="totals-row">
                <td>TOTAL</td><td></td><td></td><td><strong>{fmt(ptJunT)}</strong></td>
                <td></td><td></td><td><strong>{fmt(ptJulT)}</strong></td>
                <td style={{ color: ptJulT >= ptJunT ? 'var(--red)' : 'var(--green)' }}>{ptJulT >= ptJunT ? '+' : ''}{fmt(ptJulT - ptJunT)}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
