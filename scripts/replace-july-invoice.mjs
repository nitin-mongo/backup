/**
 * Script: replace-july-invoice.mjs
 * Reads the new July 2026 invoice CSV, processes it using the same logic
 * as UploadTab.tsx, and replaces the 2026-07 data in MongoDB.
 *
 * Usage:
 *   node scripts/replace-july-invoice.mjs <path-to-csv>
 */

import { readFileSync } from 'fs';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB  || 'darwin_backup';

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is not set.');
  console.error('Usage: MONGODB_URI="mongodb+srv://..." node scripts/replace-july-invoice.mjs <path-to-csv>');
  process.exit(1);
}
const COLLECTION  = 'dashboard_data';
const DOC_ID      = 'main';

// ── CSV Parser (mirrors lib/csvParser.ts) ──────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseAtlasCSV(text, filename) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  let headerIdx = -1;
  const meta = {};

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Date,Usage Date,Description')) { headerIdx = i; break; }
    const parts = lines[i].split(',');
    if (parts[0] && parts[0].trim()) meta[parts[0].trim()] = (parts.slice(1).join(',') || '').replace(/"/g, '').trim();
  }

  if (headerIdx === -1) return { error: 'No data header found', meta, rows: [], month: null, billingPeriod: '' };

  const headers = parseCSVLine(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < headers.length - 2) continue;
    const row = {};
    headers.forEach((h, j) => row[h] = vals[j] || '');
    rows.push(row);
  }

  const bp = meta['Billing Period'] || '';
  let month = null;
  const monthNames = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };
  for (const [name, num] of Object.entries(monthNames)) {
    const re = new RegExp(name + '\\s+1,\\s+(\\d{4})');
    const m = bp.match(re);
    if (m) { month = m[1] + '-' + num; break; }
  }

  return { meta, rows, month, error: null, billingPeriod: bp };
}

function categorizeSKU(sku) {
  if (sku.includes('Continuous Cloud Backup Storage')) return 'ccb';
  if (sku.includes('Cloud Backup Storage')) return 'cloudBackup';
  if (sku.includes('Export Upload')) return 'exportUpload';
  if (sku.includes('Export Restore Storage')) return 'exportRestore';
  if (sku.includes('Export Download VM')) return 'exportVM';
  if (sku.includes('Snapshot Export Storage IOPS')) return 'exportIOPS';
  if (sku.includes('Backup')) return 'otherBackup';
  return null;
}

function daysInMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}

// ── Main ───────────────────────────────────────────────────────────────────

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/replace-july-invoice.mjs <path-to-csv>');
  process.exit(1);
}

const csvText = readFileSync(csvPath, 'utf8');
const parsed = parseAtlasCSV(csvText, csvPath);

if (parsed.error) {
  console.error('CSV parse error:', parsed.error);
  process.exit(1);
}
if (!parsed.month) {
  console.error('Could not detect billing month from CSV. Billing Period found:', parsed.billingPeriod);
  process.exit(1);
}

console.log(`Parsed invoice: month=${parsed.month}, billingPeriod="${parsed.billingPeriod}", rows=${parsed.rows.length}`);

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);
const col = db.collection(COLLECTION);

const doc = await col.findOne({ _id: DOC_ID });
if (!doc) {
  console.error('No dashboard_data document found in MongoDB. Please seed the DB first.');
  await client.close();
  process.exit(1);
}

// Build cluster map from existing data, preserving all months EXCEPT the one being replaced
const targetMonth = parsed.month;
const existingMonths = doc.months || [];
const clusterMap = {};

doc.clusters.forEach(c => {
  clusterMap[c.name] = {};
  Object.entries(c.months).forEach(([m, md]) => {
    if (m !== targetMonth) clusterMap[c.name][m] = JSON.parse(JSON.stringify(md));
  });
});

// Process the new invoice rows for the target month
let backupRows = 0;
parsed.rows.forEach(r => {
  const cat = categorizeSKU(r['SKU'] || '');
  if (!cat) return;
  const cluster = r['Cluster'] || 'unknown';
  if (cluster === 'unknown') return;
  const amt = parseFloat(r['Amount']) || 0;
  const qty = parseFloat(r['Quantity']) || 0;
  backupRows++;

  if (!clusterMap[cluster]) clusterMap[cluster] = {};
  if (!clusterMap[cluster][targetMonth]) {
    clusterMap[cluster][targetMonth] = {
      ccb: 0, ccbTier1: 0, ccbTier2: 0, ccbTier3: 0, ccbTier4: 0,
      cloudBackup: 0, exportUpload: 0, exportRestore: 0, exportVM: 0,
      exportIOPS: 0, totalExport: 0, otherBackup: 0, total: 0,
      avgBackupGB: 0, avgDataGB: 0, exportGB: 0
    };
  }

  const md = clusterMap[cluster][targetMonth];
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

// Second pass: storage data for avgDataGB
parsed.rows.forEach(r => {
  const sku = r['SKU'] || '', cluster = r['Cluster'] || 'unknown';
  const qty = parseFloat(r['Quantity']) || 0;
  if (cluster === 'unknown') return;
  if (clusterMap[cluster]?.[targetMonth]) {
    if (sku.includes('Standard Storage') || sku.includes('Provisioned IOPS Storage')) {
      const md = clusterMap[cluster][targetMonth];
      md._data_gbhours = (md._data_gbhours || 0) + qty;
    }
  }
});

console.log(`  → ${backupRows} backup line items found for ${targetMonth}`);

// Merge the new month into sorted months list
const allMonths = new Set(existingMonths);
allMonths.add(targetMonth);
const sortedMonths = Array.from(allMonths).sort();

// Recalculate totals for each cluster / month
const dim = daysInMonth(targetMonth);
Object.keys(clusterMap).forEach(cluster => {
  const md = clusterMap[cluster][targetMonth];
  if (!md) return;
  md.totalExport = (md.exportUpload || 0) + (md.exportRestore || 0) + (md.exportVM || 0) + (md.exportIOPS || 0);
  md.total = (md.ccb || 0) + (md.cloudBackup || 0) + md.totalExport + (md.otherBackup || 0);
  if (md._ccb_gbdays) md.avgBackupGB = Math.round(md._ccb_gbdays / dim);
  if (md._data_gbhours) md.avgDataGB = Math.round(md._data_gbhours / (dim * 24));
  delete md._ccb_gbdays; delete md._data_gbhours;
  Object.keys(md).forEach(k => { if (typeof md[k] === 'number') md[k] = Math.round(md[k] * 100) / 100; });
});

// Rebuild monthly_totals
const fields = ['ccb', 'cloudBackup', 'exportUpload', 'exportRestore', 'exportVM', 'exportIOPS', 'totalExport', 'otherBackup', 'total', 'avgBackupGB', 'avgDataGB', 'exportGB'];
const newTotals = { ...doc.monthly_totals };

// Recalculate just the target month totals from cluster map
const t = {};
fields.forEach(f => t[f] = 0);
Object.keys(clusterMap).forEach(c => {
  const md = clusterMap[c][targetMonth];
  if (!md) return;
  fields.forEach(f => t[f] += (md[f] || 0));
});
fields.forEach(f => t[f] = Math.round(t[f] * 100) / 100);
newTotals[targetMonth] = t;

// Rebuild clusters array
const lastFull = sortedMonths[sortedMonths.length - 2] || sortedMonths[sortedMonths.length - 1];
const newClusters = Object.keys(clusterMap)
  .filter(c => c !== 'unknown')
  .map(c => ({ name: c, months: clusterMap[c] }))
  .filter(c => sortedMonths.some(m => (c.months[m]?.total || 0) > 50))
  .sort((a, b) => (b.months[lastFull]?.total || 0) - (a.months[lastFull]?.total || 0));

console.log(`Clusters with backup costs: ${newClusters.length}`);
console.log(`July 2026 total backup cost: $${t.total}`);

// Persist to MongoDB
const update = {
  months: sortedMonths,
  monthly_totals: newTotals,
  clusters: newClusters,
  _updatedAt: new Date().toISOString(),
};

await col.updateOne(
  { _id: DOC_ID },
  { $set: update },
  { upsert: false }
);

console.log(`\n✓ MongoDB updated. ${targetMonth} data replaced. _updatedAt: ${update._updatedAt}`);
await client.close();
