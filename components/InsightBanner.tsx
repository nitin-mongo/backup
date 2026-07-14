'use client';

import { DashboardData } from '@/lib/types';
import { fmt, fmtGB, monthLabel } from '@/lib/formatters';

interface InsightBannerProps {
  data: DashboardData;
}

export default function InsightBanner({ data }: InsightBannerProps) {
  const wi = data.whatIfTotal;
  const S3 = data.projection.s3Summary;
  return (
    <div style={{
      background: 'linear-gradient(135deg,#0d2137,#162336)',
      border: '1px solid #1f4068',
      borderRadius: 12,
      padding: 24,
      marginBottom: 24
    }}>
      <h2 style={{ fontSize: 16, color: 'var(--accent)', marginBottom: 12, fontWeight: 600 }}>
        Key Finding: Backup Optimization Saved ~{fmt(wi.savings)}/month vs No-Change Scenario
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
        {[
          { lb: "Pre-Opt Avg (Jul–Dec '25)", vl: fmt(wi.preAvgCCB), dl: 'CCB only, no exports', cls: '' },
          { lb: 'Current Atlas Total (Jun \'26)', vl: fmt(wi.actualTotal), dl: '↓ 26% on Atlas', cls: 'pos' },
          { lb: '+ AWS S3 Storage (est.)', vl: fmt(S3.junS3Cost), dl: 'Not on Atlas invoice', cls: 'warn' },
          { lb: 'Fully Loaded Total', vl: fmt(wi.actualTotal + S3.junS3Cost), dl: '↓ 20% vs pre-opt', cls: 'pos' },
          {
            lb: 'Snapshot Overhead Ratio',
            vl: `${wi.backupRatioPre}× → ${wi.backupRatioPost}×`,
            dl: `↓ ${Math.round((1 - wi.backupRatioPost / wi.backupRatioPre) * 100)}% reduction`,
            cls: 'pos'
          },
        ].map((ic, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{ic.lb}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{ic.vl}</div>
            <div style={{ fontSize: 12, marginTop: 2 }} className={ic.cls}>{ic.dl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
