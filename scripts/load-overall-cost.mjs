/**
 * load-overall-cost.mjs
 * Loads ALL Atlas invoice line items (not just backup) into MongoDB.
 * DB: overallDarwinCost  Collections: raw_line_items, monthly_summary
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/load-overall-cost.mjs
 *
 * Processes all known Darwinbox invoice files from ~/Downloads.
 */

import { MongoClient } from 'mongodb';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import os from 'os';

const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://nitin:Ronaldo32@solutionconsultingasset.pyuze.mongodb.net/?appName=darwin-backup';

const DB_NAME   = 'overallDarwinCost';
const RAW_COLL  = 'raw_line_items';
const SUMM_COLL = 'monthly_summary';

// ── Known Darwinbox invoice files (largest/most complete version per month) ──
const INVOICE_FILES = [
  { month: '2025-07', file: 'invoice_68634b38f8d7756be440252d.csv' },
  { month: '2025-08', file: 'invoice_688c263cace403649774c79c.csv' },
  { month: '2025-09', file: 'invoice_68b50403436706157f8d1905.csv' },
  { month: '2025-12', file: 'invoice_692cfdc60ffe1836d75367ba (1).csv' },
  { month: '2026-01', file: 'invoice_6955d5f01c372d5a804d6fd7.csv' },
  { month: '2026-02', file: 'invoice_697eb8860d5a91024182e9df.csv' },
  { month: '2026-03', file: 'invoice_69a39e17ebaee65afb9d1350 (1).csv' },
  { month: '2026-06', file: 'invoice_6a1cef3cc997a6bef8fd1d48.csv' },
  { month: '2026-07', file: 'invoice_6a44790db603c60f342d3494 (2).csv' },
  { month: '2026-08', file: 'invoice_6a6d53be0f53ede4adf55385.csv' },
];

// ── SKU → category mapping ───────────────────────────────────────────────────
function categoriseSKU(sku = '', description = '') {
  const s = sku.toLowerCase();
  const d = description.toLowerCase();

  // Committed-spend credits appear as negative offsets — track separately
  if (s === 'credit' || d.startsWith('credit'))                     return 'Credit';

  if (s.includes('instance') || s.includes('server'))              return 'Compute';
  if (s.includes('standard storage') || s.includes('provisioned iops') || s.includes('nvme storage')) return 'Storage';
  if (s.includes('continuous cloud backup') || s.includes('cloud backup storage')) return 'Backup-CCB';
  if (s.includes('snapshot export') || s.includes('backup download vm') ||
      s.includes('backup restore vm') || s.includes('backup restore storage')) return 'Backup-Export';
  if (s.includes('data transfer') || s.includes('transfer') || s.includes('nvt')) return 'DataTransfer';
  if (s.includes('entitlement') || s.includes('atlas pro') || s.includes('atlas standard')) return 'Support';
  if (s.includes('search') || s.includes('vector'))                return 'Search';
  if (s.includes('trigger') || s.includes('realm') || s.includes('app services')) return 'AppServices';
  if (s.includes('charts'))                                          return 'Charts';
  if (d.includes('atlas pro') || d.includes('entitlement'))         return 'Support';
  return 'Other';
}

// ── Parse one CSV file ────────────────────────────────────────────────────────
async function parseInvoice(filePath, billingMonth) {
  return new Promise((resolve, reject) => {
    const docs = [];
    let headers = null;
    let headerLineNum = null;
    let lineNum = 0;

    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

    rl.on('line', (rawLine) => {
      lineNum++;
      const line = rawLine.trim();
      if (!line) return;

      // Find the header row (contains "Date,Usage Date,Description")
      if (!headers && line.startsWith('Date,Usage Date,Description')) {
        headerLineNum = lineNum;
        headers = parseCSVRow(line);
        return;
      }
      if (!headers) return;  // still in metadata section

      const cols = parseCSVRow(line);
      if (cols.length < headers.length - 2) return;  // malformed row

      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });

      const amount = parseFloat(row['Amount'] || '0') || 0;
      if (amount === 0 && !row['SKU']) return;  // skip zero/empty rows

      const quantity  = parseFloat(row['Quantity'] || '0') || 0;
      const unitPrice = parseFloat(row['Unit Price'] || '0') || 0;
      const discPct   = parseFloat(row['Discount Percent'] || '0') || 0;

      const sku      = row['SKU'] || '';
      const cluster  = row['Cluster'] || '';
      const project  = row['Project'] || '';
      const region   = row['Region'] || '';
      const unit     = row['Unit'] || '';

      docs.push({
        billingMonth,
        date:        row['Date'] || '',
        usageDate:   row['Usage Date'] || '',
        description: row['Description'] || '',
        project,
        projectId:   row['Project ID'] || '',
        sku,
        region,
        cluster,
        replicaSet:  row['Replica Set'] || '',
        unit,
        unitPrice,
        quantity,
        discountPct: discPct,
        amount,
        category:    categoriseSKU(sku, row['Description'] || ''),
      });
    });

    rl.on('close', () => resolve(docs));
    rl.on('error', reject);
  });
}

// Simple CSV row parser (handles quoted fields with commas)
function parseCSVRow(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB');

  const db      = client.db(DB_NAME);
  const rawColl = db.collection(RAW_COLL);
  const summColl = db.collection(SUMM_COLL);

  // Drop and recreate for a clean load
  await rawColl.drop().catch(() => {});
  await summColl.drop().catch(() => {});
  console.log('Cleared existing collections');

  const downloadsDir = path.join(os.homedir(), 'Downloads');

  let totalDocs = 0;
  const monthlySummaries = {};

  for (const { month, file } of INVOICE_FILES) {
    const filePath = path.join(downloadsDir, file);
    console.log(`\nProcessing ${month}: ${file}`);

    let docs;
    try {
      docs = await parseInvoice(filePath, month);
    } catch (e) {
      console.error(`  ✗ Could not read ${file}: ${e.message}`);
      continue;
    }

    if (docs.length === 0) {
      console.log(`  ⚠ No line items found in ${file}`);
      continue;
    }

    // Insert raw docs
    await rawColl.insertMany(docs);
    totalDocs += docs.length;
    console.log(`  ✓ Inserted ${docs.length} line items`);

    // Build monthly summary — gross charges only (credits tracked separately)
    const summary = { billingMonth: month, categories: {}, grossAmount: 0, creditAmount: 0, netAmount: 0 };
    for (const doc of docs) {
      const cat = doc.category;
      if (!summary.categories[cat]) summary.categories[cat] = { amount: 0, lineItems: 0 };
      summary.categories[cat].amount     += doc.amount;
      summary.categories[cat].lineItems  += 1;
      if (cat === 'Credit') {
        summary.creditAmount += doc.amount;   // negative
      } else {
        summary.grossAmount  += doc.amount;   // positive usage charges
      }
    }
    summary.netAmount = summary.grossAmount + summary.creditAmount;  // ~0 for committed-spend customers
    // Round
    for (const cat of Object.keys(summary.categories)) {
      summary.categories[cat].amount = Math.round(summary.categories[cat].amount * 100) / 100;
    }
    summary.grossAmount  = Math.round(summary.grossAmount  * 100) / 100;
    summary.creditAmount = Math.round(summary.creditAmount * 100) / 100;
    summary.netAmount    = Math.round(summary.netAmount    * 100) / 100;

    // Backup-specific sub-totals (from gross charges only)
    const backupCCB    = summary.categories['Backup-CCB']?.amount    || 0;
    const backupExport = summary.categories['Backup-Export']?.amount || 0;
    summary.backupTotal    = Math.round((backupCCB + backupExport) * 100) / 100;
    summary.nonBackupTotal = Math.round((summary.grossAmount - summary.backupTotal) * 100) / 100;
    summary.backupPct = summary.grossAmount > 0
      ? Math.round((summary.backupTotal / summary.grossAmount) * 10000) / 100
      : 0;

    monthlySummaries[month] = summary;
    await summColl.insertOne(summary);
    console.log(`  Gross: $${Math.round(summary.grossAmount).toLocaleString()}  Credits: $${Math.round(summary.creditAmount).toLocaleString()}  Backup: $${Math.round(summary.backupTotal).toLocaleString()} (${summary.backupPct}%)`);
  }

  // Create indexes
  await rawColl.createIndex({ billingMonth: 1, category: 1 });
  await rawColl.createIndex({ billingMonth: 1, cluster: 1 });
  await rawColl.createIndex({ billingMonth: 1, sku: 1 });
  await summColl.createIndex({ billingMonth: 1 }, { unique: true });

  console.log(`\n✅ Done — ${totalDocs} total line items across ${Object.keys(monthlySummaries).length} months`);

  // ── Print cross-month analysis ────────────────────────────────────────────
  console.log('\n=== Monthly GROSS Cost — Backup vs Non-Backup (credits excluded) ===');
  console.log('Note: Credits are committed-spend offsets — net invoice ~$0. Gross = real usage.\n');
  const cats = ['Compute', 'Storage', 'Backup-CCB', 'Backup-Export', 'DataTransfer', 'Support', 'Other'];
  const pad = (s, n) => String(s).padStart(n);

  console.log('\n' + 'Month'.padEnd(8) + cats.map(c => c.padStart(14)).join('') + pad('Gross Total', 13) + pad('Backup%', 9));
  console.log('-'.repeat(8 + cats.length * 14 + 22));

  for (const month of INVOICE_FILES.map(x => x.month)) {
    const s = monthlySummaries[month];
    if (!s) continue;
    const row = cats.map(c => pad('$' + Math.round(s.categories[c]?.amount || 0).toLocaleString(), 14)).join('');
    console.log(month + row + pad('$' + Math.round(s.grossAmount).toLocaleString(), 13) + pad(s.backupPct + '%', 9));
  }

  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
