# File Metrics

A free Visual Studio Code extension that displays the largest files in your workspace, helping you identify code bloat and manage project complexity.

**Built by the makers of [Quickfix AI](https://quickfix.ai)**

## Features

- **Custom Explorer View**: Adds a "File Metrics" section to the Explorer sidebar
- **Dual Metrics**: Toggle between viewing files by:
  - Lines of Code (LOC)
  - File Size (KB/MB)
- **Smart Filtering**: Automatically excludes common build folders and configuration files
- **Auto-Refresh**: Updates automatically when files are saved, created, or deleted
- **Click to Open**: Click any file in the list to open it in the editor
- **Persistent Preferences**: Remembers your last selected metric across sessions
- **Configurable**: Customize excluded folders, file extensions, and display limit

## Usage

### Viewing File Metrics

1. Open the Explorer sidebar (usually the first icon in the Activity Bar)
2. Scroll to find the "File Metrics" section
3. Click on any file to open it in the editor

### Toggle Display Metric

Click the swap icon (⇄) in the view title bar, or run the command:
- Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- Type: "Toggle File Metrics Display"

### Manual Refresh

Click the refresh icon (↻) in the view title bar, or run the command:
- Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- Type: "Refresh File Metrics"

## Configuration

Customize the extension behavior in your settings:

### Maximum Files to Display

```json
{
  "largestFiles.maxFiles": 20
}
```

Default: `20`

### Excluded Folders

```json
{
  "largestFiles.excludedFolders": [
    "components",
    "node_modules",
    ".git",
    "dist",
    "build",
    "out"
  ]
}
```

### File Extensions to Include

```json
{
  "largestFiles.fileExtensions": [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".h",
    ".cs",
    ".rb",
    ".go",
    ".php",
    ".swift",
    ".kt",
    ".rs"
  ]
}
```

## Commands

- `largestFiles.refresh`: Manually refresh the file list
- `largestFiles.toggleMetric`: Switch between Lines of Code and File Size metrics

## About

File Metrics is a free VS Code extension built by the makers of [Quickfix AI](https://quickfix.ai) - helping developers understand and manage their codebase complexity.

## Performance

The extension is optimized for large workspaces:
- Uses efficient streaming for line counting
- Caches file metrics to avoid redundant scans
- Debounces file system events to prevent excessive refreshes
- Respects VS Code's file exclusion patterns

## Development

### Prerequisites

- Node.js
- VS Code

### Build and Run

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

### Package Extension

```bash
npm install -g @vscode/vsce
vsce package
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Release Notes

### 0.0.1

Initial release:
- View largest files by lines of code or file size
- Auto-refresh on file changes
- Configurable exclusions and file types
- Persistent metric preference
