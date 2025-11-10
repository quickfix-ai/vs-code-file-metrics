import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as readline from 'readline';
import * as path from 'path';
import { createReadStream } from 'fs';
import { FileMetric, FileInfo, TreeItem, HiddenFilesGroup, SeverityLevel } from './types';

export class LargestFilesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private currentMetric: FileMetric;
  private fileCache: Map<string, { loc: number; size: number }> = new Map();
  private isLoading: boolean = false;
  private filesData: FileInfo[] = [];
  private hiddenFiles: Set<string> = new Set();

  constructor(private context: vscode.ExtensionContext) {
    const savedMetric = context.globalState.get<FileMetric>('largestFiles.metric');
    this.currentMetric = savedMetric || FileMetric.LinesOfCode;

    const savedHiddenFiles = context.workspaceState.get<string[]>('largestFiles.hiddenFiles');
    if (savedHiddenFiles) {
      this.hiddenFiles = new Set(savedHiddenFiles);
    }

    this.scanWorkspace();
  }

  refresh(): void {
    this.fileCache.clear();
    this.scanWorkspace();
  }

  async toggleMetric(): Promise<void> {
    this.currentMetric = this.currentMetric === FileMetric.LinesOfCode
      ? FileMetric.FileSize
      : FileMetric.LinesOfCode;

    await this.context.globalState.update('largestFiles.metric', this.currentMetric);

    this.updateFilesDataWithCurrentMetric();
    this._onDidChangeTreeData.fire();

    const metricName = this.currentMetric === FileMetric.LinesOfCode ? 'Lines of Code' : 'File Size';
    vscode.window.showInformationMessage(`Largest Files: Now showing ${metricName}`);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    if (typeof element === 'string') {
      const item = new vscode.TreeItem(element);
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      return item;
    }

    if ('type' in element && element.type === 'hiddenGroup') {
      const item = new vscode.TreeItem(
        `Hidden Files (${element.count})`,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.iconPath = new vscode.ThemeIcon('eye-closed');
      item.contextValue = 'hiddenGroup';
      return item;
    }

    const fileInfo = element as FileInfo;
    const fileName = path.basename(fileInfo.relativePath);
    const formattedMetric = this.formatMetric(fileInfo.metricValue, fileInfo.metric);
    const label = `${fileName} – ${formattedMetric}`;

    const item = new vscode.TreeItem(label);
    item.resourceUri = vscode.Uri.file(fileInfo.path);
    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(fileInfo.path)]
    };

    // Apply colored icon based on severity
    if (fileInfo.severity === SeverityLevel.Danger) {
      item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
    } else if (fileInfo.severity === SeverityLevel.Warning) {
      item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
    } else {
      item.iconPath = vscode.ThemeIcon.File;
    }

    // Update tooltip to include severity info and both metrics
    const locFormatted = `${fileInfo.linesOfCode.toLocaleString()} lines`;
    const sizeFormatted = this.formatMetric(fileInfo.fileSizeKB * 1024, FileMetric.FileSize);
    let tooltipText = `${fileInfo.relativePath}\n${locFormatted} | ${sizeFormatted}`;

    if (fileInfo.severity === SeverityLevel.Danger) {
      tooltipText += '\n⚠️ Large file (exceeds danger threshold)';
    } else if (fileInfo.severity === SeverityLevel.Warning) {
      tooltipText += '\n⚠️ Medium-large file (exceeds warning threshold)';
    }

    item.tooltip = tooltipText;

    const isHidden = this.hiddenFiles.has(fileInfo.path);
    item.contextValue = isHidden ? 'hiddenFile' : 'visibleFile';

    return item;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (this.isLoading) {
      return ['Loading...'];
    }

    if (element && typeof element !== 'string') {
      if ('type' in element && element.type === 'hiddenGroup') {
        return this.filesData.filter(file => this.hiddenFiles.has(file.path));
      }
      return [];
    }

    const visibleFiles = this.filesData.filter(file => !this.hiddenFiles.has(file.path));

    const result: TreeItem[] = [...visibleFiles];

    if (this.hiddenFiles.size > 0) {
      result.push({
        type: 'hiddenGroup',
        count: this.hiddenFiles.size
      });
    }

    return result;
  }

  private async scanWorkspace(): Promise<void> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      console.log('[File Metrics] No workspace folders found');
      this.filesData = [];
      this._onDidChangeTreeData.fire();
      return;
    }

    this.isLoading = true;
    this._onDidChangeTreeData.fire();

    try {
      const config = vscode.workspace.getConfiguration('largestFiles');
      const excludedFolders = config.get<string[]>('excludedFolders') || [];
      const fileExtensions = config.get<string[]>('fileExtensions') || [];
      const maxFiles = config.get<number>('maxFiles') || 20;

      const extensionPattern = `**/*{${fileExtensions.join(',')}}`;
      // Create a proper exclude pattern - use brace expansion for multiple patterns
      const excludePattern = `{${excludedFolders.map(folder => `**/${folder}/**`).join(',')}}`;

      console.log('[File Metrics] Scanning with pattern:', extensionPattern);
      console.log('[File Metrics] Excluding pattern:', excludePattern);
      console.log('[File Metrics] Excluded folders:', excludedFolders);
      console.log('[File Metrics] Workspace folders:', vscode.workspace.workspaceFolders.map(f => f.uri.fsPath));

      const files = await vscode.workspace.findFiles(extensionPattern, excludePattern);

      console.log('[File Metrics] Found', files.length, 'files matching pattern');

      const fileInfoPromises = files.map(async (uri) => {
        const filePath = uri.fsPath;

        let cached = this.fileCache.get(filePath);

        if (!cached) {
          const [loc, size] = await Promise.all([
            this.countLines(filePath),
            this.getFileSize(filePath)
          ]);
          cached = { loc, size };
          this.fileCache.set(filePath, cached);
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const relativePath = workspaceFolder
          ? path.relative(workspaceFolder.uri.fsPath, filePath)
          : path.basename(filePath);

        const fileSizeKB = cached.size / 1024;
        const severity = this.calculateSeverity(cached.loc, fileSizeKB);

        return {
          path: filePath,
          relativePath,
          metricValue: this.currentMetric === FileMetric.LinesOfCode ? cached.loc : cached.size,
          metric: this.currentMetric,
          linesOfCode: cached.loc,
          fileSizeKB: fileSizeKB,
          severity: severity
        };
      });

      const allFiles = await Promise.all(fileInfoPromises);

      // Filter to only show files that meet at least one threshold (warning or danger)
      const filesAboveThreshold = allFiles.filter(file => file.severity !== SeverityLevel.None);

      filesAboveThreshold.sort((a, b) => b.metricValue - a.metricValue);

      this.filesData = filesAboveThreshold.slice(0, maxFiles);

      console.log('[File Metrics] Found', filesAboveThreshold.length, 'files above thresholds');
      console.log('[File Metrics] Displaying', this.filesData.length, 'files');
      if (this.filesData.length > 0) {
        console.log('[File Metrics] Top file:', this.filesData[0].relativePath, '-', this.filesData[0].metricValue, 'lines');
      }

    } catch (error) {
      console.error('[File Metrics] Error scanning workspace:', error);
      vscode.window.showErrorMessage('Failed to scan workspace for largest files');
      this.filesData = [];
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  private async countLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let lineCount = 0;
      const rl = readline.createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity
      });

      rl.on('line', () => {
        lineCount++;
      });

      rl.on('close', () => {
        resolve(lineCount);
      });

      rl.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      console.error(`Error getting file size for ${filePath}:`, error);
      return 0;
    }
  }

  private updateFilesDataWithCurrentMetric(): void {
    this.filesData = this.filesData.map(file => {
      const cached = this.fileCache.get(file.path);
      const fileSizeKB = (cached?.size || 0) / 1024;
      const linesOfCode = cached?.loc || 0;
      const severity = this.calculateSeverity(linesOfCode, fileSizeKB);

      return {
        ...file,
        metricValue: this.currentMetric === FileMetric.LinesOfCode
          ? linesOfCode
          : (cached?.size || 0),
        metric: this.currentMetric,
        linesOfCode: linesOfCode,
        fileSizeKB: fileSizeKB,
        severity: severity
      };
    });

    // Filter to only show files that meet at least one threshold
    this.filesData = this.filesData.filter(file => file.severity !== SeverityLevel.None);

    this.filesData.sort((a, b) => b.metricValue - a.metricValue);

    const config = vscode.workspace.getConfiguration('largestFiles');
    const maxFiles = config.get<number>('maxFiles') || 20;
    this.filesData = this.filesData.slice(0, maxFiles);
  }

  private formatMetric(value: number, metric: FileMetric): string {
    if (metric === FileMetric.LinesOfCode) {
      return `${value.toLocaleString()} lines`;
    } else {
      const kb = value / 1024;
      if (kb < 1024) {
        return `${kb.toFixed(1)} KB`;
      } else {
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
      }
    }
  }

  private calculateSeverity(linesOfCode: number, fileSizeKB: number): SeverityLevel {
    const config = vscode.workspace.getConfiguration('largestFiles.colorThresholds');
    const dangerLoc = config.get<number>('dangerLoc', 1000);
    const dangerSize = config.get<number>('dangerSize', 100);
    const warningLoc = config.get<number>('warningLoc', 500);
    const warningSize = config.get<number>('warningSize', 50);

    // Check if either LOC or file size meets danger threshold
    if (linesOfCode >= dangerLoc || fileSizeKB >= dangerSize) {
      return SeverityLevel.Danger;
    }

    // Check if either LOC or file size meets warning threshold
    if (linesOfCode >= warningLoc || fileSizeKB >= warningSize) {
      return SeverityLevel.Warning;
    }

    return SeverityLevel.None;
  }

  async invalidateFile(uri: vscode.Uri): Promise<void> {
    this.fileCache.delete(uri.fsPath);
    await this.scanWorkspace();
  }

  async hideFile(fileInfo: FileInfo): Promise<void> {
    this.hiddenFiles.add(fileInfo.path);
    await this.saveHiddenFiles();
    this._onDidChangeTreeData.fire();
  }

  async unhideFile(fileInfo: FileInfo): Promise<void> {
    this.hiddenFiles.delete(fileInfo.path);
    await this.saveHiddenFiles();
    this._onDidChangeTreeData.fire();
  }

  private async saveHiddenFiles(): Promise<void> {
    await this.context.workspaceState.update('largestFiles.hiddenFiles', Array.from(this.hiddenFiles));
  }
}
