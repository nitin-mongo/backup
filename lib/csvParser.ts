export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
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

export interface ParsedInvoice {
  meta: Record<string, string>;
  rows: Record<string, string>[];
  month: string | null;
  billingPeriod: string;
  error: string | null;
}

export function parseAtlasCSV(text: string, filename: string): ParsedInvoice {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  let headerIdx = -1;
  const meta: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Date,Usage Date,Description')) { headerIdx = i; break; }
    const parts = lines[i].split(',');
    if (parts[0] && parts[0].trim()) meta[parts[0].trim()] = (parts.slice(1).join(',') || '').replace(/"/g, '').trim();
  }

  if (headerIdx === -1) return { error: 'No data header found', meta, rows: [], month: null, billingPeriod: '' };

  const headers = parseCSVLine(lines[headerIdx]);
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < headers.length - 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => row[h] = vals[j] || '');
    rows.push(row);
  }

  const bp = meta['Billing Period'] || '';
  let month: string | null = null;
  const monthNames: Record<string, string> = {
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

export type SKUCategory = 'ccb' | 'cloudBackup' | 'exportUpload' | 'exportRestore' | 'exportVM' | 'exportIOPS' | 'otherBackup';

export function categorizeSKU(sku: string): SKUCategory | null {
  if (sku.includes('Continuous Cloud Backup Storage')) return 'ccb';
  if (sku.includes('Cloud Backup Storage')) return 'cloudBackup';
  if (sku.includes('Export Upload')) return 'exportUpload';
  if (sku.includes('Export Restore Storage')) return 'exportRestore';
  if (sku.includes('Export Download VM')) return 'exportVM';
  if (sku.includes('Snapshot Export Storage IOPS')) return 'exportIOPS';
  if (sku.includes('Backup')) return 'otherBackup';
  return null;
}
