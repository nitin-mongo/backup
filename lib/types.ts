export interface MonthData {
  [key: string]: number;
  ccb: number;
  ccbTier1: number;
  ccbTier2: number;
  ccbTier3: number;
  ccbTier4: number;
  cloudBackup: number;
  exportUpload: number;
  exportRestore: number;
  exportVM: number;
  exportIOPS: number;
  totalExport: number;
  otherBackup: number;
  total: number;
  avgBackupGB: number;
  avgDataGB: number;
  exportGB: number;
}

export interface WhatIf {
  preAvgCCB: number;
  preAvgData: number;
  junData: number;
  dataGrowth: number;
  hypotheticalCCB: number;
  actualTotal: number;
  savings: number;
}

export interface Cluster {
  name: string;
  months: Record<string, MonthData>;
  whatIf?: WhatIf;
}

export interface WhatIfTotal {
  preAvgCCB: number;
  preAvgData: number;
  preAvgTotal: number;
  junData: number;
  dataGrowth: number;
  hypotheticalCCB: number;
  actualTotal: number;
  savings: number;
  preAvgBackupGB: number;
  junBackupGB: number;
  backupRatioPre: number;
  backupRatioPost: number;
}

export interface ProjectionMonth {
  ccb: number;
  cloudBackup: number;
  exportUpload: number;
  exportRestore: number;
  exportVM: number;
  exportIOPS: number;
  totalExport: number;
  total: number;
}

export interface S3Estimate {
  export_gb: number;
  daily_avg_gb: number;
  clusters: number;
  atlas_export_cost: number;
  atlas_upload_cost: number;
  s3_stored_gb: number;
  s3_cost: number;
  retained_days: number;
}

export interface ClusterS3 {
  name: string;
  exportGB: number;
  exportDays: number;
  dailyAvgGB: number;
  s3StoredGB: number;
  s3Cost: number;
  atlasExportCost: number;
}

export interface S3Summary {
  junS3StoredGB: number;
  junS3Cost: number;
  julS3StoredGB: number;
  julS3Cost: number;
  julExportGBProj: number;
}

export interface Projection {
  julyDaysCovered: number;
  julyTotalDays: number;
  june: ProjectionMonth;
  julyProjected: ProjectionMonth;
  s3Estimates: Record<string, S3Estimate>;
  clusterS3: ClusterS3[];
  s3Summary: S3Summary;
}

export interface Scenario {
  label: string;
  retention: number;
  exportFreq: string;
  ccb: number;
  cloudBackup: number;
  atlasExport: number;
  atlasSubtotal: number;
  s3StoredGB: number;
  s3Cost: number;
  fullyLoaded: number;
}

export interface DashboardData {
  months: string[];
  clusters: Cluster[];
  monthly_totals: Record<string, MonthData>;
  partialMonths: string[];
  whatIfTotal: WhatIfTotal;
  projection: Projection;
  scenarios: Record<string, Scenario>;
}
