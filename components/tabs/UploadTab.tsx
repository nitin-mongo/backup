'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { DashboardData, MonthData } from '@/lib/types';
import { fmt, monthLabel, daysInMonth } from '@/lib/formatters';
import { parseAtlasCSV, categorizeSKU, ParsedInvoice } from '@/lib/csvParser';

const ChartWrapper = dynamic(() => import('@/components/ChartWrapper'), { ssr: false });

interface Props { data: DashboardData; }

interface UploadedFile extends ParsedInvoice {
  name: string;
}

export default function UploadTab({ data }: Props) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [results, setResults] = useState<{ months: string[]; totals: Record<string, MonthData>; clusters: Array<{ name: string; months: Record<string, MonthData> }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const existingMonths = new Set(data.months);

  const addLog = (msg: string) => setLogLines(prev => [...prev, msg]);

  const handleFiles = (files: FileList) => {
    Array.from(files).forEach(file => {
      if (!file.name.endsWith('.csv')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const parsed = parseAtlasCSV(e.target!.result as string, file.name);
        setUploadedFiles(prev => [...prev, { name: file.name, ...parsed }]);
      };
      reader.readAsText(file);
    });
  };

  const removeFile = (i: number) => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));

  const analyze = async () => {
    setLogLines([]);
    addLog('Starting analysis of ' + uploadedFiles.length + ' invoice(s)...');

    const allMonths = new Set(data.months);
    const clusterMap: Record<string, Record<string, MonthData & { _ccb_gbdays?: number; _data_gbhours?: number }>> = {};
    data.clusters.forEach(c => {
      clusterMap[c.name] = JSON.parse(JSON.stringify(c.months));
    });

    uploadedFiles.forEach(f => {
      if (f.error || !f.month) { addLog(`⚠ Skipping ${f.name}: ${f.error || 'no month detected'}`); return; }
      addLog(`Processing ${f.name} → ${f.month} (${f.rows.length} rows)`);
      allMonths.add(f.month);
      let backupRows = 0;

      f.rows.forEach(r => {
        const cat = categorizeSKU(r['SKU'] || '');
        if (!cat) return;
        const cluster = r['Cluster'] || 'unknown';
        if (cluster === 'unknown') return;
        const amt = parseFloat(r['Amount']) || 0;
        const qty = parseFloat(r['Quantity']) || 0;
        backupRows++;

        if (!clusterMap[cluster]) clusterMap[cluster] = {};
        if (!clusterMap[cluster][f.month!]) {
          clusterMap[cluster][f.month!] = { ccb: 0, ccbTier1: 0, ccbTier2: 0, ccbTier3: 0, ccbTier4: 0, cloudBackup: 0, exportUpload: 0, exportRestore: 0, exportVM: 0, exportIOPS: 0, totalExport: 0, otherBackup: 0, total: 0, avgBackupGB: 0, avgDataGB: 0, exportGB: 0 };
        }

        const md = clusterMap[cluster][f.month!] as Record<string, number>;
        if (cat === 'ccb') {
          md.ccb += amt;
          md._ccb_gbdays = (md._ccb_gbdays || 0) + qty;
          if ((r['Description'] || '').includes('Tier 1')) md.ccbTier1 += amt;
          else if ((r['Description'] || '').includes('Tier 2')) md.ccbTier2 += amt;
          else if ((r['Description'] || '').includes('Tier 3')) md.ccbTier3 += amt;
          else md.ccbTier4 += amt;
        } else if (cat === 'cloudBackup') { md.cloudBackup += amt; }
        else if (cat === 'exportUpload') { md.exportUpload += amt; md.exportGB += qty; }
        else if (cat === 'exportRestore') { md.exportRestore += amt; }
        else if (cat === 'exportVM') { md.exportVM += amt; }
        else if (cat === 'exportIOPS') { md.exportIOPS += amt; }
        else if (cat === 'otherBackup') { md.otherBackup += amt; }
      });

      f.rows.forEach(r => {
        const sku = r['SKU'] || '', cluster = r['Cluster'] || 'unknown';
        const qty = parseFloat(r['Quantity']) || 0;
        if (cluster === 'unknown') return;
        if (clusterMap[cluster]?.[f.month!]) {
          if (sku.includes('Standard Storage') || sku.includes('Provisioned IOPS Storage')) {
            (clusterMap[cluster][f.month!] as Record<string, number>)._data_gbhours = ((clusterMap[cluster][f.month!] as Record<string, number>)._data_gbhours || 0) + qty;
          }
        }
      });
      addLog(`  → ${backupRows} backup line items found`);
    });

    const sortedMonths = Array.from(allMonths).sort();
    addLog('Recalculating ' + Object.keys(clusterMap).length + ' clusters across ' + sortedMonths.length + ' months...');

    Object.keys(clusterMap).forEach(cluster => {
      sortedMonths.forEach(m => {
        const md = clusterMap[cluster][m] as Record<string, number>;
        if (!md) return;
        md.totalExport = (md.exportUpload || 0) + (md.exportRestore || 0) + (md.exportVM || 0) + (md.exportIOPS || 0);
        md.total = (md.ccb || 0) + (md.cloudBackup || 0) + md.totalExport + (md.otherBackup || 0);
        const dim = daysInMonth(m);
        if (md._ccb_gbdays) md.avgBackupGB = Math.round(md._ccb_gbdays / dim);
        if (md._data_gbhours) md.avgDataGB = Math.round(md._data_gbhours / (dim * 24));
        delete md._ccb_gbdays; delete md._data_gbhours;
        Object.keys(md).forEach(k => { if (typeof md[k] === 'number') md[k] = Math.round(md[k] * 100) / 100; });
      });
    });

    const fields: (keyof MonthData)[] = ['ccb', 'cloudBackup', 'exportUpload', 'exportRestore', 'exportVM', 'exportIOPS', 'totalExport', 'otherBackup', 'total', 'avgBackupGB', 'avgDataGB', 'exportGB'];
    const newTotals: Record<string, MonthData> = {};
    sortedMonths.forEach(m => {
      const t = {} as Record<string, number>;
      fields.forEach(f2 => t[f2] = 0);
      Object.keys(clusterMap).forEach(c => {
        const md = clusterMap[c][m] as Record<string, number>;
        if (!md) return;
        fields.forEach(f2 => t[f2 as string] += (md[f2 as string] || 0));
      });
      fields.forEach(f2 => t[f2 as string] = Math.round(t[f2 as string] * 100) / 100);
      newTotals[m] = t as unknown as MonthData;
    });

    const lastFull = sortedMonths[sortedMonths.length - 2] || sortedMonths[sortedMonths.length - 1];
    const newClusters = Object.keys(clusterMap)
      .filter(c => c !== 'unknown')
      .map(c => ({ name: c, months: clusterMap[c] as Record<string, MonthData> }))
      .filter(c => sortedMonths.some(m => ((c.months[m] as Record<string, number>)?.total || 0) > 50))
      .sort((a, b) => ((b.months[lastFull] as Record<string, number>)?.total || 0) - ((a.months[lastFull] as Record<string, number>)?.total || 0));

    addLog('✓ Analysis complete! Months: ' + sortedMonths.join(', '));
    addLog('Clusters with backup costs: ' + newClusters.length);

    setResults({ months: sortedMonths, totals: newTotals, clusters: newClusters });

    // Persist to MongoDB Atlas
    addLog('');
    addLog('Saving to MongoDB Atlas...');
    try {
      // Build a minimal payload with the new data merged into existing
      const payload = {
        months: sortedMonths,
        monthly_totals: newTotals,
        clusters: newClusters.map(c => ({ name: c.name, months: c.months })),
        partialMonths: data.partialMonths,
        whatIfTotal: data.whatIfTotal,
        projection: data.projection,
        scenarios: data.scenarios,
      };

      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        addLog(`✓ Saved to MongoDB Atlas at ${json.updatedAt}`);
      } else {
        addLog(`⚠ MongoDB save failed: ${json.error}`);
      }
    } catch (err) {
      addLog(`⚠ MongoDB save error: ${String(err)}`);
    }
  };

  return (
    <div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Upload Additional Atlas Invoice CSVs</h3>
        <p style={{ color: 'var(--text2)', marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
          Upload MongoDB Atlas invoice CSV files to extend the analysis. The parser will extract backup-related line items and regenerate charts and tables. Existing data is preserved — new months are merged in.
        </p>

        <div
          className={`drop-zone${isDragOver ? ' over' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <h3 style={{ fontSize: 16, marginBottom: 8, color: 'var(--text)' }}>📂 Drop invoice CSV files here</h3>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>or click to browse — accepts multiple .csv files</p>
          <input ref={fileInputRef} type="file" multiple accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>

        <div style={{ marginTop: 16 }}>
          {uploadedFiles.map((f, i) => {
            const isDup = existingMonths.has(f.month || '');
            return (
              <div key={i} className="file-item">
                <div style={{ flex: 1, fontWeight: 500, color: 'var(--text)' }}>{f.name}</div>
                <div style={{ color: 'var(--text2)' }}>{f.month || 'Unknown period'} — {f.billingPeriod}</div>
                {f.error ? <span className="fi-err">Error</span> : isDup ? <span className="fi-dup">Already loaded</span> : <span className="fi-ok">{f.rows.length} rows</span>}
                <span style={{ cursor: 'pointer', color: 'var(--text2)' }} onClick={() => removeFile(i)}>✕</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={uploadedFiles.length === 0} onClick={analyze}>
            Analyze & Regenerate Dashboard
          </button>
          {uploadedFiles.length > 0 && (
            <button className="btn btn-outline" onClick={() => { setUploadedFiles([]); setResults(null); setLogLines([]); }}>
              Clear Uploaded
            </button>
          )}
        </div>

        {logLines.length > 0 && (
          <div ref={logRef} className="analysis-log">
            {logLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>

      {results && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Updated Analysis Results</h3>

          {/* Insight banner */}
          {(() => {
            const firstM = results.months[0], lastFullM = results.months[results.months.length - 2] || results.months[results.months.length - 1];
            const firstT = results.totals[firstM], lastT = results.totals[lastFullM];
            const peakMonth = results.months.reduce((a, b) => (results.totals[a]?.total || 0) > (results.totals[b]?.total || 0) ? a : b);
            return (
              <div style={{ background: 'linear-gradient(135deg,#0d2137,#162336)', border: '1px solid #1f4068', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h2 style={{ fontSize: 15, color: 'var(--accent)', marginBottom: 12 }}>Updated Analysis: {results.months.length} Months</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  {[
                    { lb: `First Month (${firstM})`, vl: fmt(firstT?.total || 0) },
                    { lb: `Peak Month (${peakMonth})`, vl: fmt(results.totals[peakMonth]?.total || 0), cls: 'neg' },
                    { lb: `Latest Full Month (${lastFullM})`, vl: fmt(lastT?.total || 0) },
                    { lb: 'Change (First → Latest)', vl: fmt((lastT?.total || 0) - (firstT?.total || 0)), cls: (lastT?.total || 0) <= (firstT?.total || 0) ? 'pos' : 'neg' },
                  ].map((ic, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{ic.lb}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: ic.cls ? undefined : 'var(--text)' }} className={ic.cls || ''}>{ic.vl}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Chart */}
          <ChartWrapper type="bar" data={{
            labels: results.months.map(monthLabel),
            datasets: [
              { label: 'CCB', data: results.months.map(m => results.totals[m]?.ccb || 0), backgroundColor: '#58a6ff', stack: 's' },
              { label: 'Cloud Backup', data: results.months.map(m => results.totals[m]?.cloudBackup || 0), backgroundColor: '#bc8cff', stack: 's' },
              { label: 'S3 Export', data: results.months.map(m => results.totals[m]?.totalExport || 0), backgroundColor: '#d29922', stack: 's' },
            ],
          }} height={360} options={{ plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw as number) } }, legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { ticks: { callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'K' }, grid: { color: '#21262d' } }, x: { grid: { display: false } } } }} />

          {/* Monthly totals table */}
          <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Updated Monthly Totals</div>
            <div className="scr">
              <table>
                <thead><tr><th>Month</th><th>CCB</th><th>Cloud Backup</th><th>S3 Export</th><th>Total</th><th>Backup GB</th><th>Data GB</th><th>Ratio</th><th>MoM Δ</th></tr></thead>
                <tbody>
                  {results.months.map((m, i) => {
                    const t = results.totals[m];
                    const ratio = t?.avgDataGB > 0 ? (t.avgBackupGB / t.avgDataGB).toFixed(2) : '—';
                    const prev = i > 0 ? results.totals[results.months[i - 1]] : null;
                    const delta = prev ? t.total - prev.total : null;
                    return (
                      <tr key={m}>
                        <td>{m}</td>
                        <td>{fmt(t?.ccb || 0)}</td><td>{fmt(t?.cloudBackup || 0)}</td><td>{fmt(t?.totalExport || 0)}</td>
                        <td><strong>{fmt(t?.total || 0)}</strong></td>
                        <td>{t?.avgBackupGB > 0 ? Math.round(t.avgBackupGB).toLocaleString() : '—'}</td>
                        <td>{t?.avgDataGB > 0 ? Math.round(t.avgDataGB).toLocaleString() : '—'}</td>
                        <td>{ratio}×</td>
                        <td>{delta !== null ? <span style={{ color: delta >= 0 ? 'var(--red)' : 'var(--green)' }}>{delta >= 0 ? '+' : ''}{fmt(delta)}</span> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
