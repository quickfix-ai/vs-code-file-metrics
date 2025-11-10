export enum FileMetric {
  LinesOfCode = 'loc',
  FileSize = 'size'
}

export enum SeverityLevel {
  None = 'none',
  Warning = 'warning',
  Danger = 'danger'
}

export interface FileInfo {
  path: string;
  relativePath: string;
  metricValue: number;
  metric: FileMetric;
  linesOfCode: number;
  fileSizeKB: number;
  severity?: SeverityLevel;
}

export interface HiddenFilesGroup {
  type: 'hiddenGroup';
  count: number;
}

export type TreeItem = FileInfo | HiddenFilesGroup | string;
