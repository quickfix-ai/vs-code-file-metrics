import * as vscode from 'vscode';
import { LargestFilesProvider } from './LargestFilesProvider';

let fileWatcher: vscode.FileSystemWatcher | undefined;
let refreshTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Largest Files extension is now active');

  const largestFilesProvider = new LargestFilesProvider(context);

  const treeView = vscode.window.createTreeView('largestFiles', {
    treeDataProvider: largestFilesProvider,
    showCollapseAll: false
  });

  context.subscriptions.push(treeView);

  const refreshCommand = vscode.commands.registerCommand('largestFiles.refresh', () => {
    largestFilesProvider.refresh();
  });

  const toggleMetricCommand = vscode.commands.registerCommand('largestFiles.toggleMetric', () => {
    largestFilesProvider.toggleMetric();
  });

  const hideFileCommand = vscode.commands.registerCommand('largestFiles.hideFile', (fileInfo) => {
    largestFilesProvider.hideFile(fileInfo);
  });

  const unhideFileCommand = vscode.commands.registerCommand('largestFiles.unhideFile', (fileInfo) => {
    largestFilesProvider.unhideFile(fileInfo);
  });

  const openSettingsCommand = vscode.commands.registerCommand('largestFiles.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'largestFiles');
  });

  context.subscriptions.push(refreshCommand);
  context.subscriptions.push(toggleMetricCommand);
  context.subscriptions.push(hideFileCommand);
  context.subscriptions.push(unhideFileCommand);
  context.subscriptions.push(openSettingsCommand);

  setupFileWatcher(largestFilesProvider, context);

  const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('largestFiles')) {
      largestFilesProvider.refresh();
    }
  });

  context.subscriptions.push(configChangeListener);
}

function setupFileWatcher(provider: LargestFilesProvider, context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('largestFiles');
  const fileExtensions = config.get<string[]>('fileExtensions') || [];

  const watchPattern = `**/*{${fileExtensions.join(',')}}`;

  fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

  const debouncedRefresh = () => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      provider.refresh();
    }, 500);
  };

  fileWatcher.onDidCreate((uri) => {
    debouncedRefresh();
  });

  fileWatcher.onDidChange((uri) => {
    provider.invalidateFile(uri);
  });

  fileWatcher.onDidDelete((uri) => {
    debouncedRefresh();
  });

  context.subscriptions.push(fileWatcher);
}

export function deactivate() {
  if (fileWatcher) {
    fileWatcher.dispose();
  }
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
}
