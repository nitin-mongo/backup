import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(projectRoot, 'data/dashboardData.json');
const discountDataPath = path.join(projectRoot, 'data/discountData.json');
const write = process.argv.includes('--write');
const cutoffArg = process.argv.find(arg => arg.startsWith('--through='));
const cutoffDate = cutoffArg?.slice('--through='.length) || null;
if (cutoffDate && !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
  throw new Error(`Invalid cutoff date: ${cutoffDate}. Use --through=YYYY-MM-DD.`);
}
const inputPaths = process.argv.slice(2).filter(arg => arg !== '--write' && !arg.startsWith('--through='));
const invoicePaths = inputPaths.length
  ? inputPaths.map(file => path.resolve(file))
  : readdirSync(projectRoot).filter(file => /^invoice_.*\.csv$/i.test(file)).sort().map(file => path.join(projectRoot, file));

if (invoicePaths.length === 0) {
  throw new Error('No invoice CSV files found in the project folder.');
}

function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field.trim());
  return fields;
}

function parseInvoice(filePath) {
  const lines = readFileSync(filePath, 'utf8').replace(/\r/g, '').split('\n').filter(line => line.trim());
  const headerIndex = lines.findIndex(line => line.startsWith('Date,Usage Date,Description'));
  if (headerIndex < 0) throw new Error(`${path.basename(filePath)} has no invoice line-item header.`);

  const metadata = new Map();
  for (const line of lines.slice(0, headerIndex)) {
    const [key, ...values] = parseCSVLine(line);
    if (key) metadata.set(key, values.join(',').replace(/,$/, ''));
  }

  const billingPeriod = metadata.get('Billing Period') || '';
  const start = billingPeriod.match(/([A-Za-z]+)\s+1,\s+(\d{4})/);
  const monthNumber = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
  }[start?.[1]];
  if (!start || !monthNumber) throw new Error(`${path.basename(filePath)} has an unsupported billing period: ${billingPeriod}`);

  const month = `${start[2]}-${monthNumber}`;
  const headers = parseCSVLine(lines[headerIndex]);
  const rows = lines.slice(headerIndex + 1).map(line => {
    const values = parseCSVLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  }).filter(row => row['SKU']);

  return { filePath, month, billingPeriod, organizationName: metadata.get('Organization Name') || 'unknown-org', headers, rows };
}

function categoryForSKU(sku) {
  if (sku.includes('Continuous Cloud Backup Storage')) return 'ccb';
  if (sku.includes('Cloud Backup Storage')) return 'cloudBackup';
  if (sku.includes('Export Upload')) return 'exportUpload';
  if (sku.includes('Export Restore Storage')) return 'exportRestore';
  if (sku.includes('Export Download VM')) return 'exportVM';
  if (sku.includes('Snapshot Export Storage IOPS')) return 'exportIOPS';
  if (sku.includes('Backup')) return 'otherBackup';
  return null;
}

function getUsageMonthAndDay(value) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return { month: `${match[3]}-${match[1].padStart(2, '0')}`, day: match[2].padStart(2, '0') };
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function emptyMonth() {
  return {
    ccb: 0, ccbTier1: 0, ccbTier2: 0, ccbTier3: 0, ccbTier4: 0,
    cloudBackup: 0, exportUpload: 0, exportRestore: 0, exportVM: 0,
    exportIOPS: 0, totalExport: 0, otherBackup: 0, total: 0,
    avgBackupGB: 0, avgDataGB: 0, exportGB: 0,
  };
}

function roundNumbers(record) {
  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'number') record[key] = Math.round(record[key] * 100) / 100;
  }
}

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const discountData = JSON.parse(readFileSync(discountDataPath, 'utf8'));
const parsedInvoices = invoicePaths.map(parseInvoice).sort((a, b) => a.month.localeCompare(b.month));
const invoicesByMonth = new Map();
for (const invoice of parsedInvoices) {
  if (!invoicesByMonth.has(invoice.month)) invoicesByMonth.set(invoice.month, []);
  invoicesByMonth.get(invoice.month).push(invoice);
}
const invoices = [...invoicesByMonth.entries()].map(([month, monthInvoices]) => ({
  month,
  billingPeriod: monthInvoices.map(invoice => invoice.billingPeriod).join('; '),
  filePath: monthInvoices.map(invoice => path.basename(invoice.filePath)).join(', '),
  rows: monthInvoices.flatMap(invoice => invoice.rows.map(row => ({
    ...row,
    Cluster: row['Cluster'] && invoice.organizationName !== 'darwinbox-master'
      ? `${invoice.organizationName}/${row['Cluster']}`
      : row['Cluster'],
  }))).filter(row => {
    if (!cutoffDate) return true;
    const usageDate = getUsageMonthAndDay(row['Usage Date'] || '');
    if (!usageDate) return false;
    return usageDate.month === cutoffDate.slice(0, 7) && Number(usageDate.day) <= Number(cutoffDate.slice(8, 10));
  }),
}));
const invoiceMonths = new Set();
const existingClusterNames = new Set(data.clusters.map(cluster => cluster.name));
const clusterMap = new Map(data.clusters.map(cluster => [cluster.name, {
  ...cluster,
  months: { ...cluster.months },
}]));
const originalMonthOrder = new Map([...clusterMap.values()].map(cluster => [cluster.name, Object.keys(cluster.months)]));
const replacedMonths = new Set();
const partialMonths = new Set(data.partialMonths || []);
const partialMonthDays = { ...(data.partialMonthDays || {}) };

for (const invoice of invoices) {
  invoiceMonths.add(invoice.month);
  replacedMonths.add(invoice.month);

  const usageDays = new Set();
  const discountTotals = { grossTotal: 0, netTotal: 0, ccbGross: 0, ccbNet: 0 };
  let backupRows = 0;

  for (const cluster of clusterMap.values()) delete cluster.months[invoice.month];

  for (const row of invoice.rows) {
    const usageDate = getUsageMonthAndDay(row['Usage Date'] || '');
    if (usageDate?.month === invoice.month) usageDays.add(usageDate.day);

    const sku = row['SKU'] || '';
    const amount = Number.parseFloat(row['Amount']) || 0;
    const rawDiscount = Number.parseFloat(row['Discount Percent']) || 0;
    const discountRate = rawDiscount > 1 ? rawDiscount / 100 : rawDiscount;
    const grossAmount = discountRate > 0 && discountRate < 1 ? amount / (1 - discountRate) : amount;
    discountTotals.grossTotal += grossAmount;
    discountTotals.netTotal += amount;
    if (sku.includes('Continuous Cloud Backup Storage')) {
      discountTotals.ccbGross += grossAmount;
      discountTotals.ccbNet += amount;
    }

    const clusterName = row['Cluster'] || 'unknown';
    if (clusterName === 'unknown') continue;

    const category = categoryForSKU(row['SKU'] || '');
    let cluster = clusterMap.get(clusterName);
    if (!cluster) {
      cluster = { name: clusterName, months: {} };
      clusterMap.set(clusterName, cluster);
    }

    if (!cluster.months[invoice.month]) cluster.months[invoice.month] = emptyMonth();
    const monthData = cluster.months[invoice.month];
    const quantity = Number.parseFloat(row['Quantity']) || 0;

    if (category) {
      backupRows++;
      if (category === 'ccb') {
        monthData.ccb += amount;
        monthData._ccbGBDays = (monthData._ccbGBDays || 0) + quantity;
        const description = row['Description'] || '';
        if (description.includes('Tier 1')) monthData.ccbTier1 += amount;
        else if (description.includes('Tier 2')) monthData.ccbTier2 += amount;
        else if (description.includes('Tier 3')) monthData.ccbTier3 += amount;
        else monthData.ccbTier4 += amount;
      } else if (category === 'cloudBackup') monthData.cloudBackup += amount;
      else if (category === 'exportUpload') {
        monthData.exportUpload += amount;
        monthData.exportGB += quantity;
      } else if (category === 'exportRestore') monthData.exportRestore += amount;
      else if (category === 'exportVM') monthData.exportVM += amount;
      else if (category === 'exportIOPS') monthData.exportIOPS += amount;
      else if (category === 'otherBackup') monthData.otherBackup += amount;
    }

    if (sku.includes('Standard Storage') || sku.includes('Provisioned IOPS Storage')) {
      monthData._dataGBHours = (monthData._dataGBHours || 0) + quantity;
    }
  }

  const coveredDays = usageDays.size || daysInMonth(invoice.month);
  partialMonthDays[invoice.month] = coveredDays;
  const isPartial = coveredDays < Math.floor(daysInMonth(invoice.month) * 0.85);
  if (isPartial) partialMonths.add(invoice.month);
  else partialMonths.delete(invoice.month);

  const grossTotal = Math.round(discountTotals.grossTotal * 100) / 100;
  const netTotal = Math.round(discountTotals.netTotal * 100) / 100;
  const ccbGross = Math.round(discountTotals.ccbGross * 100) / 100;
  const ccbNet = Math.round(discountTotals.ccbNet * 100) / 100;
  discountData.discountByMonth[invoice.month] = {
    grossTotal,
    netTotal,
    discount: Math.round((grossTotal - netTotal) * 100) / 100,
    discountPct: grossTotal ? Math.round(((grossTotal - netTotal) / grossTotal) * 1000) / 10 : 0,
    ccbGross,
    ccbNet,
    ccbDiscount: Math.round((ccbGross - ccbNet) * 100) / 100,
    ccbDiscountPct: ccbGross ? Math.round(((ccbGross - ccbNet) / ccbGross) * 1000) / 10 : 0,
    hasGrossData: true,
    contractActive: invoice.month >= discountData.summary.contractStart,
  };

  for (const cluster of clusterMap.values()) {
    const monthData = cluster.months[invoice.month];
    if (!monthData) continue;
    monthData.totalExport = monthData.exportUpload + monthData.exportRestore + monthData.exportVM + monthData.exportIOPS;
    monthData.total = monthData.ccb + monthData.cloudBackup + monthData.totalExport + monthData.otherBackup;
    if (monthData._ccbGBDays) monthData.avgBackupGB = Math.round(monthData._ccbGBDays / coveredDays);
    if (monthData._dataGBHours) monthData.avgDataGB = Math.round(monthData._dataGBHours / (coveredDays * 24));
    delete monthData._ccbGBDays;
    delete monthData._dataGBHours;
    roundNumbers(monthData);
  }

  console.log(`${invoice.month}: ${invoice.filePath} | ${invoice.billingPeriod} | ${coveredDays}/${daysInMonth(invoice.month)} days | ${backupRows} backup rows | CCB discount saved $${discountData.discountByMonth[invoice.month].ccbDiscount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

const months = [...new Set([...data.months, ...invoiceMonths])].sort();
const totalFields = [
  'ccb', 'cloudBackup', 'exportUpload', 'exportRestore', 'exportVM', 'exportIOPS',
  'totalExport', 'otherBackup', 'total', 'avgBackupGB', 'avgDataGB', 'exportGB',
];
const monthlyTotals = { ...data.monthly_totals };

for (const month of replacedMonths) {
  const total = Object.fromEntries(totalFields.map(field => [field, 0]));
  for (const cluster of clusterMap.values()) {
    const monthData = cluster.months[month];
    if (!monthData) continue;
    for (const field of totalFields) total[field] += monthData[field] || 0;
  }
  roundNumbers(total);
  monthlyTotals[month] = total;
}

const clusters = [...clusterMap.values()]
  .map(cluster => {
    const previousOrder = originalMonthOrder.get(cluster.name) || [];
    const monthKeys = Object.keys(cluster.months);
    const orderedMonthKeys = [
      ...previousOrder.filter(month => monthKeys.includes(month)),
      ...monthKeys.filter(month => !previousOrder.includes(month)),
    ];
    return { ...cluster, months: Object.fromEntries(orderedMonthKeys.map(month => [month, cluster.months[month]])) };
  })
  .filter(cluster => existingClusterNames.has(cluster.name) || months.some(month => (cluster.months[month]?.total || 0) > 50))
  .sort((a, b) => (b.months[months.at(-1)]?.total || 0) - (a.months[months.at(-1)]?.total || 0));

const updatedData = {
  ...data,
  months,
  clusters,
  monthly_totals: monthlyTotals,
  partialMonths: [...partialMonths].sort(),
  partialMonthDays,
};

const discountMonths = Object.values(discountData.discountByMonth);
const contractDiscountMonths = discountMonths.filter(month => month.contractActive);
const sumField = (rows, field) => Math.round(rows.reduce((sum, month) => sum + (month[field] || 0), 0) * 100) / 100;
discountData.summary = {
  ...discountData.summary,
  totalGross: sumField(discountMonths, 'grossTotal'),
  totalNet: sumField(discountMonths, 'netTotal'),
  totalDiscount: sumField(discountMonths, 'discount'),
  postContractGross: sumField(contractDiscountMonths, 'grossTotal'),
  postContractDiscount: sumField(contractDiscountMonths, 'discount'),
};

const actualCCBSavings = Object.entries(discountData.discountByMonth)
  .filter(([month]) => month >= discountData.summary.contractStart && month <= months.at(-1))
  .reduce((sum, [, monthData]) => sum + monthData.ccbDiscount, 0);

if (write) {
  writeFileSync(dataPath, `${JSON.stringify(updatedData, null, 2)}\n`);
  writeFileSync(discountDataPath, `${JSON.stringify(discountData, null, 2)}\n`);
  console.log(`Updated ${path.relative(projectRoot, dataPath)} with ${months.at(-1)} as the latest month.`);
  console.log(`Updated ${path.relative(projectRoot, discountDataPath)} with $${actualCCBSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CCB discount savings since ${discountData.summary.contractStart}.`);
} else {
  console.log(`Dry run only. ${months.length} months; ${clusters.length} clusters; latest month ${months.at(-1)}; CCB discount savings since ${discountData.summary.contractStart}: $${actualCCBSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Pass --write to update the bundled data.`);
}