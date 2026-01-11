# VS Markdown Sidebar

A VS Code extension that provides a dedicated sidebar for editing and previewing Markdown files.

![VS Markdown Sidebar](icon.png)

## Features

- **Sidebar Editor**: Edit Markdown files directly in the sidebar without opening a new tab
- **Live Preview**: Toggle between edit and preview mode with beautifully rendered Markdown
- **Syntax Highlighting**: Code blocks with syntax highlighting
- **Mermaid Diagrams**: Full support for Mermaid diagrams (flowcharts, sequence diagrams, etc.)
- **Auto-Save**: Changes are automatically saved after 1 second of inactivity
- **Persistent State**: The last opened file is automatically restored when VS Code restarts
- **Recent Files**: Quick access to the last 10 opened Markdown files

## Usage

1. Click the Markdown icon in the Activity Bar to open the sidebar
2. Use the toolbar buttons:
   - **Folder icon**: Open a Markdown file
   - **History icon**: Show recent files
   - **Preview icon**: Toggle between edit and preview mode

## Preview Support

The preview mode renders all common Markdown elements:

- Headings (h1-h6)
- Bold, italic, and strikethrough text
- Code blocks with syntax highlighting
- Inline code
- Links and images
- Blockquotes
- Ordered and unordered lists
- Tables
- Horizontal rules
- Task lists (checkboxes)
- Mermaid diagrams

## Installation

### From VS Code Marketplace

Search for "VS Markdown Sidebar" in the VS Code Extensions view.

### From Source

```bash
git clone https://github.com/benwilles/vs-markdown-sidebar.git
cd vs-markdown-sidebar
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

### Package as VSIX

```bash
npm install -g @vscode/vsce
vsce package
```

Install the generated `.vsix` file via VS Code's "Install from VSIX" option.

## Requirements

- VS Code 1.85.0 or higher

## Author

Ben Willes

## License

MIT License - see [LICENSE](LICENSE) for details.
