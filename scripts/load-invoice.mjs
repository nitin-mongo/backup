/**
 * Script: load-invoice.mjs
 * General-purpose Atlas invoice loader.
 * - Detects billing month from CSV metadata
 * - Auto-detects partial months (< 85% of month days covered)
 * - Updates partialMonths[] in MongoDB accordingly
 * - Can be run multiple times for the same month (replaces data each time)
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/load-invoice.mjs <path-to-csv>
 */

import { readFileSync } from 'fs';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB  || 'darwin_backup';
const COLLECTION  = 'dashboard_data';
const DOC_ID      = 'main';

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is not set.');
  console.error('Usage: MONGODB_URI="mongodb+srv://..." node scripts/load-invoice.mjs <path-to-csv>');
  process.exit(1);
}

// ── CSV Parser ─────────────────────────────────────────────────────────────

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

function parseAtlasCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  let headerIdx = -1;
  const meta = {};

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Date,Usage Date,Description')) { headerIdx = i; break; }
    const parts = lines[i].split(',');
    if (parts[0] && parts[0].trim()) meta[parts[0].trim()] = (parts.slice(1).join(',') || '').replace(/"/g, '').trim();
  }

  if (headerIdx === -1) return { error: 'No data header found', meta, rows: [], month: null };

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

  return { meta, rows, month, billingPeriod: bp, error: null };
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
  console.error('Usage: MONGODB_URI="..." node scripts/load-invoice.mjs <path-to-csv>');
  process.exit(1);
}

const csvText = readFileSync(csvPath, 'utf8');
const parsed = parseAtlasCSV(csvText);

if (parsed.error) { console.error('CSV parse error:', parsed.error); process.exit(1); }
if (!parsed.month) {
  console.error('Could not detect billing month. Billing Period found:', parsed.billingPeriod);
  process.exit(1);
}

const targetMonth = parsed.month;
const dim = daysInMonth(targetMonth);

console.log(`\nInvoice: month=${targetMonth}, billingPeriod="${parsed.billingPeriod}", rows=${parsed.rows.length}`);

// ── Detect actual days covered (for partial month detection) ───────────────
const usageDaysInMonth = new Set();
parsed.rows.forEach(r => {
  const ud = r['Usage Date'] || '';
  const parts = ud.split('/');
  if (parts.length !== 3) return;
  const rowMonth = `${parts[2]}-${parts[0].padStart(2, '0')}`;
  if (rowMonth === targetMonth) usageDaysInMonth.add(parts[1].padStart(2, '0'));
});

const actualDays = usageDaysInMonth.size > 0 ? usageDaysInMonth.size : dim;
const isPartial  = actualDays < Math.floor(dim * 0.85);

console.log(`  Days covered: ${actualDays} of ${dim} → ${isPartial ? 'PARTIAL month' : 'full month'}`);

// ── Connect to MongoDB ─────────────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI);
await client.connect();
const db  = client.db(MONGODB_DB);
const col = db.collection(COLLECTION);

const doc = await col.findOne({ _id: DOC_ID });
if (!doc) {
  console.error('No dashboard_data document found. Please seed the DB first.');
  await client.close();
  process.exit(1);
}

// ── Build cluster map (preserve all existing months except targetMonth) ────
const clusterMap = {};
doc.clusters.forEach(c => {
  clusterMap[c.name] = {};
  Object.entries(c.months).forEach(([m, md]) => {
    if (m !== targetMonth) clusterMap[c.name][m] = JSON.parse(JSON.stringify(md));
  });
});

// ── First pass: backup cost fields ────────────────────────────────────────
let backupRows = 0;
parsed.rows.forEach(r => {
  const cat = categorizeSKU(r['SKU'] || '');
  if (!cat) return;
  const cluster = r['Cluster'] || 'unknown';
  if (cluster === 'unknown') return;
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

  const md  = clusterMap[cluster][targetMonth];
  const amt = parseFloat(r['Amount'])   || 0;
  const qty = parseFloat(r['Quantity']) || 0;

  if (cat === 'ccb') {
    md.ccb += amt;
    md._ccb_gbdays = (md._ccb_gbdays || 0) + qty;
    const desc = r['Description'] || '';
    if (desc.includes('Tier 1'))      md.ccbTier1 += amt;
    else if (desc.includes('Tier 2')) md.ccbTier2 += amt;
    else if (desc.includes('Tier 3')) md.ccbTier3 += amt;
    else                              md.ccbTier4 += amt;
  } else if (cat === 'cloudBackup') { md.cloudBackup += amt; }
  else if (cat === 'exportUpload')  { md.exportUpload += amt; md.exportGB += qty; }
  else if (cat === 'exportRestore') { md.exportRestore += amt; }
  else if (cat === 'exportVM')      { md.exportVM += amt; }
  else if (cat === 'exportIOPS')    { md.exportIOPS += amt; }
  else if (cat === 'otherBackup')   { md.otherBackup += amt; }
});

// ── Second pass: storage (provisioned disk) ───────────────────────────────
parsed.rows.forEach(r => {
  const sku = r['SKU'] || '', cluster = r['Cluster'] || 'unknown';
  if (cluster === 'unknown') return;
  if (sku.includes('Standard Storage') || sku.includes('Provisioned IOPS Storage')) {
    if (clusterMap[cluster]?.[targetMonth]) {
      const md = clusterMap[cluster][targetMonth];
      md._data_gbhours = (md._data_gbhours || 0) + (parseFloat(r['Quantity']) || 0);
    }
  }
});

console.log(`  Backup line items: ${backupRows}`);

// ── Recalculate totals ─────────────────────────────────────────────────────
// For partial months: use actualDays so avgBackupGB/avgDataGB reflect the daily
// rate during the covered period (not a fraction of a full-month average).
Object.keys(clusterMap).forEach(cluster => {
  const md = clusterMap[cluster][targetMonth];
  if (!md) return;
  md.totalExport = (md.exportUpload || 0) + (md.exportRestore || 0) + (md.exportVM || 0) + (md.exportIOPS || 0);
  md.total = (md.ccb || 0) + (md.cloudBackup || 0) + md.totalExport + (md.otherBackup || 0);
  if (md._ccb_gbdays)   md.avgBackupGB = Math.round(md._ccb_gbdays   / actualDays);
  if (md._data_gbhours) md.avgDataGB   = Math.round(md._data_gbhours / (actualDays * 24));
  delete md._ccb_gbdays; delete md._data_gbhours;
  Object.keys(md).forEach(k => { if (typeof md[k] === 'number') md[k] = Math.round(md[k] * 100) / 100; });
});

// ── Rebuild months list ────────────────────────────────────────────────────
const allMonths = new Set(doc.months || []);
allMonths.add(targetMonth);
const sortedMonths = Array.from(allMonths).sort();

// ── Rebuild monthly_totals ─────────────────────────────────────────────────
const fields = ['ccb', 'cloudBackup', 'exportUpload', 'exportRestore', 'exportVM',
                'exportIOPS', 'totalExport', 'otherBackup', 'total', 'avgBackupGB', 'avgDataGB', 'exportGB'];
const newTotals = { ...doc.monthly_totals };
const t = {};
fields.forEach(f => t[f] = 0);
Object.keys(clusterMap).forEach(c => {
  const md = clusterMap[c][targetMonth];
  if (!md) return;
  fields.forEach(f => t[f] += (md[f] || 0));
});
fields.forEach(f => t[f] = Math.round(t[f] * 100) / 100);
newTotals[targetMonth] = t;

// ── Rebuild clusters array ─────────────────────────────────────────────────
const lastFull = [...sortedMonths].reverse().find(m => m !== targetMonth) || sortedMonths[0];
const newClusters = Object.keys(clusterMap)
  .filter(c => c !== 'unknown')
  .map(c => ({ name: c, months: clusterMap[c] }))
  .filter(c => sortedMonths.some(m => (c.months[m]?.total || 0) > 50))
  .sort((a, b) => (b.months[lastFull]?.total || 0) - (a.months[lastFull]?.total || 0));

// ── Update partialMonths ───────────────────────────────────────────────────
const existingPartials = doc.partialMonths || [];
let newPartials;
if (isPartial) {
  newPartials = [...new Set([...existingPartials, targetMonth])].sort();
} else {
  newPartials = existingPartials.filter(m => m !== targetMonth);
}

console.log(`\n  Total backup cost (${targetMonth}): $${t.total.toLocaleString()}`);
console.log(`  Clusters: ${newClusters.length}`);
console.log(`  partialMonths: [${newPartials.join(', ')}]`);

// ── Persist to MongoDB ─────────────────────────────────────────────────────
const update = {
  months: sortedMonths,
  monthly_totals: newTotals,
  clusters: newClusters,
  partialMonths: newPartials,
  _updatedAt: new Date().toISOString(),
};

await col.updateOne({ _id: DOC_ID }, { $set: update }, { upsert: false });

console.log(`\n✓ MongoDB updated. ${targetMonth} data loaded. _updatedAt: ${update._updatedAt}`);
await client.close();
