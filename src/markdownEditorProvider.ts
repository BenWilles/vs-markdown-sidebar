import * as vscode from 'vscode';

export class MarkdownEditorProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'markdownEditor';
    private static readonly LAST_FILE_KEY = 'markdownSidebar.lastOpenedFile';
    private static readonly RECENT_FILES_KEY = 'markdownSidebar.recentFiles';
    private static readonly MAX_RECENT_FILES = 10;

    private _view?: vscode.WebviewView;
    private _currentFileUri?: vscode.Uri;
    private _currentContent: string = '';
    private _context: vscode.ExtensionContext;
    private _autoSaveTimeout?: NodeJS.Timeout;

    constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._context = context;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'contentChanged':
                    this._currentContent = data.content;
                    this._scheduleAutoSave();
                    break;
                case 'ready':
                    // Webview is ready, restore content if we have any
                    this._restoreContent();
                    break;
            }
        });

        // When view becomes visible again, restore content
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this._currentFileUri) {
                this._restoreContent();
            }
        });
    }

    private _restoreContent() {
        // If we have a current file loaded, restore it
        if (this._currentFileUri && this._currentContent) {
            this._view?.webview.postMessage({
                type: 'loadContent',
                content: this._currentContent,
                filename: this._getFilename(this._currentFileUri)
            });
        } else {
            // Otherwise try to load the last file from workspace state
            this._loadLastFile();
        }
    }

    private async _loadLastFile() {
        const lastFilePath = this._context.workspaceState.get<string>(MarkdownEditorProvider.LAST_FILE_KEY);
        if (lastFilePath) {
            try {
                const uri = vscode.Uri.file(lastFilePath);
                const content = await vscode.workspace.fs.readFile(uri);
                this._currentFileUri = uri;
                this._currentContent = Buffer.from(content).toString('utf8');

                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'loadContent',
                        content: this._currentContent,
                        filename: this._getFilename(uri)
                    });
                }
            } catch (error) {
                // File no longer exists, clear the stored path
                this._context.workspaceState.update(MarkdownEditorProvider.LAST_FILE_KEY, undefined);
            }
        }
    }

    private _saveLastFile(uri: vscode.Uri) {
        this._context.workspaceState.update(MarkdownEditorProvider.LAST_FILE_KEY, uri.fsPath);
        this._addToRecentFiles(uri.fsPath);
    }

    private _addToRecentFiles(filePath: string) {
        const recentFiles = this._context.workspaceState.get<string[]>(MarkdownEditorProvider.RECENT_FILES_KEY, []);

        // Remove if already exists (to move to top)
        const filtered = recentFiles.filter(f => f !== filePath);

        // Add to beginning
        filtered.unshift(filePath);

        // Keep only last N files
        const trimmed = filtered.slice(0, MarkdownEditorProvider.MAX_RECENT_FILES);

        this._context.workspaceState.update(MarkdownEditorProvider.RECENT_FILES_KEY, trimmed);
    }

    public async showRecentFiles() {
        const recentFiles = this._context.workspaceState.get<string[]>(MarkdownEditorProvider.RECENT_FILES_KEY, []);

        if (recentFiles.length === 0) {
            vscode.window.showInformationMessage('No recent files');
            return;
        }

        const items = recentFiles.map(filePath => ({
            label: this._getFilename(vscode.Uri.file(filePath)),
            description: filePath,
            filePath: filePath
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a recent file'
        });

        if (selected) {
            await this._openFileByPath(selected.filePath);
        }
    }

    private async _openFileByPath(filePath: string) {
        try {
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            this._currentFileUri = uri;
            this._currentContent = Buffer.from(content).toString('utf8');

            this._saveLastFile(uri);

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'loadContent',
                    content: this._currentContent,
                    filename: this._getFilename(uri)
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
    }

    private _scheduleAutoSave() {
        if (this._autoSaveTimeout) {
            clearTimeout(this._autoSaveTimeout);
        }
        this._autoSaveTimeout = setTimeout(() => {
            this._autoSave();
        }, 1000); // 1 second delay
    }

    private async _autoSave() {
        if (!this._currentFileUri) {
            return;
        }
        try {
            const contentBuffer = Buffer.from(this._currentContent, 'utf8');
            await vscode.workspace.fs.writeFile(this._currentFileUri, contentBuffer);
        } catch (error) {
            // Silent fail for auto-save
        }
    }

    public async openFile() {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Markdown': ['md']
            }
        });

        if (fileUri && fileUri[0]) {
            this._currentFileUri = fileUri[0];
            const content = await vscode.workspace.fs.readFile(fileUri[0]);
            this._currentContent = Buffer.from(content).toString('utf8');

            // Save the file path for persistence
            this._saveLastFile(fileUri[0]);

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'loadContent',
                    content: this._currentContent,
                    filename: this._getFilename(fileUri[0])
                });
            }
        }
    }

    public async saveFile() {
        if (!this._currentFileUri) {
            vscode.window.showWarningMessage('No file is currently open');
            return;
        }

        try {
            const contentBuffer = Buffer.from(this._currentContent, 'utf8');
            await vscode.workspace.fs.writeFile(this._currentFileUri, contentBuffer);
            vscode.window.showInformationMessage(`Saved ${this._getFilename(this._currentFileUri)}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save file: ${error}`);
        }
    }

    public togglePreview() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'togglePreview'
            });
        }
    }

    private _getFilename(uri: vscode.Uri): string {
        const parts = uri.fsPath.split(/[/\\]/);
        return parts[parts.length - 1];
    }

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Editor</title>
    <!-- Marked.js for Markdown parsing -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <!-- Highlight.js for syntax highlighting -->
    <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
    <!-- Mermaid for diagrams -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            padding: 8px 12px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            font-size: 12px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .filename {
            font-weight: bold;
        }
        .mode-indicator {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .placeholder {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        textarea {
            flex: 1;
            width: 100%;
            padding: 12px;
            border: none;
            outline: none;
            resize: none;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--vscode-editor-font-size, 14px);
            line-height: 1.5;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .preview {
            flex: 1;
            padding: 12px;
            overflow-y: auto;
            font-size: 14px;
            line-height: 1.6;
        }
        .preview h1, .preview h2, .preview h3, .preview h4, .preview h5, .preview h6 {
            margin-top: 1em;
            margin-bottom: 0.5em;
            font-weight: 600;
            line-height: 1.25;
        }
        .preview h1 { font-size: 1.8em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
        .preview h2 { font-size: 1.4em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
        .preview h3 { font-size: 1.2em; }
        .preview h4 { font-size: 1em; }
        .preview h5 { font-size: 0.875em; }
        .preview h6 { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
        .preview p {
            margin-bottom: 1em;
        }
        .preview ul, .preview ol {
            margin-bottom: 1em;
            padding-left: 2em;
        }
        .preview li {
            margin-bottom: 0.25em;
        }
        .preview code {
            font-family: var(--vscode-editor-font-family, monospace);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .preview pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin-bottom: 1em;
        }
        .preview pre code {
            padding: 0;
            background: none;
            font-size: 13px;
        }
        .preview blockquote {
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding-left: 1em;
            margin: 0 0 1em 0;
            color: var(--vscode-textBlockQuote-foreground);
        }
        .preview a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .preview a:hover {
            text-decoration: underline;
        }
        .preview hr {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 1.5em 0;
        }
        .preview strong {
            font-weight: 600;
        }
        .preview em {
            font-style: italic;
        }
        .preview img {
            max-width: 100%;
            height: auto;
        }
        .preview table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
        }
        .preview th, .preview td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
        }
        .preview th {
            background-color: var(--vscode-textCodeBlock-background);
            font-weight: 600;
        }
        .preview input[type="checkbox"] {
            margin-right: 0.5em;
        }
        .preview del {
            text-decoration: line-through;
            color: var(--vscode-descriptionForeground);
        }
        .preview .mermaid {
            background: var(--vscode-editor-background);
            text-align: center;
            margin: 1em 0;
        }
        .hidden {
            display: none;
        }
        /* One Dark Pro Jetbrains - Custom Highlight.js Theme */
        .hljs {
            background: #1e1f22;
            color: #BDC0C9;
        }
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-built_in,
        .hljs-type {
            color: #6c95eb;
        }
        .hljs-function,
        .hljs-title.function_,
        .hljs-title {
            color: #39cc8f;
        }
        .hljs-string,
        .hljs-attr {
            color: #c9a26d;
        }
        .hljs-number,
        .hljs-literal {
            color: #51C0CF;
        }
        .hljs-comment {
            color: #6E798A;
        }
        .hljs-doctag {
            color: #648769;
        }
        .hljs-class,
        .hljs-title.class_,
        .hljs-type {
            color: #c191ff;
        }
        .hljs-property,
        .hljs-variable,
        .hljs-template-variable {
            color: #66c3cc;
        }
        .hljs-tag {
            color: #D5B778;
        }
        .hljs-name {
            color: #D5B778;
        }
        .hljs-attribute {
            color: #66c3cc;
        }
        .hljs-regexp,
        .hljs-template-tag {
            color: #B8B167;
        }
        .hljs-meta,
        .hljs-selector-id,
        .hljs-selector-class {
            color: #66c3cc;
        }
        .hljs-symbol,
        .hljs-bullet {
            color: #51C0CF;
        }
        .hljs-addition {
            color: #39cc8f;
        }
        .hljs-deletion {
            color: #FF5263;
        }
        .hljs-emphasis {
            font-style: italic;
        }
        .hljs-strong {
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header" id="header">
        <span class="filename" id="filename">No file open</span>
        <span class="mode-indicator" id="modeIndicator">Edit</span>
    </div>
    <div class="placeholder" id="placeholder">
        Click the folder icon above to open a Markdown file
    </div>
    <textarea
        id="editor"
        class="hidden"
        placeholder="Start typing your markdown..."
    ></textarea>
    <div id="preview" class="preview hidden"></div>

    <script>
        // Initialize Mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose'
        });

        // Configure marked
        marked.setOptions({
            breaks: true,
            gfm: true
        });

        const vscode = acquireVsCodeApi();
        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const placeholder = document.getElementById('placeholder');
        const filename = document.getElementById('filename');
        const modeIndicator = document.getElementById('modeIndicator');

        let isPreviewMode = false;
        let hasFile = false;
        let mermaidId = 0;

        editor.addEventListener('input', () => {
            vscode.postMessage({
                type: 'contentChanged',
                content: editor.value
            });
        });

        async function renderPreview(text) {
            // First, extract mermaid blocks and replace with placeholders
            const mermaidBlocks = [];
            // Use String.fromCharCode to avoid backtick escaping issues in template literal
            const backticks = String.fromCharCode(96, 96, 96);
            const mermaidRegex = new RegExp(backticks + 'mermaid\\\\s*\\\\n([\\\\s\\\\S]*?)' + backticks, 'g');
            let processedText = text.replace(mermaidRegex, (match, code) => {
                const id = 'mermaid-' + (mermaidId++);
                const trimmedCode = code.trim();
                // Extract diagram type (first word)
                const diagramType = trimmedCode.split(/[\\s\\n]/)[0] || 'unknown';
                mermaidBlocks.push({ id, code: trimmedCode, diagramType });
                return '<div class="mermaid" id="' + id + '"></div>';
            });

            // Parse markdown with marked
            let html = marked.parse(processedText);
            preview.innerHTML = html;

            // Apply syntax highlighting to code blocks
            preview.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });

            // Render mermaid diagrams
            for (const block of mermaidBlocks) {
                const element = document.getElementById(block.id);
                if (!element) continue;

                try {
                    const { svg } = await mermaid.render(block.id + '-svg', block.code);
                    element.innerHTML = svg;
                } catch (e) {
                    // Show error inline with diagram type and collapsible code
                    element.innerHTML =
                        '<div style="border: 1px solid #f44336; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: left;">' +
                        '<div style="color: #f44336; font-weight: bold; margin-bottom: 4px;">Mermaid Error (' + block.diagramType + ')</div>' +
                        '<div style="color: #ff9800; font-size: 12px; margin-bottom: 8px;">' + e.message + '</div>' +
                        '<details style="font-size: 11px;">' +
                        '<summary style="cursor: pointer; color: var(--vscode-descriptionForeground);">Show code</summary>' +
                        '<pre style="margin-top: 8px; padding: 8px; background: var(--vscode-textCodeBlock-background); overflow-x: auto; white-space: pre-wrap;">' +
                        block.code.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
                        '</pre></details></div>';
                }
            }
        }

        async function updateView() {
            if (!hasFile) return;

            if (isPreviewMode) {
                editor.classList.add('hidden');
                preview.classList.remove('hidden');
                await renderPreview(editor.value);
                modeIndicator.textContent = 'Preview';
            } else {
                preview.classList.add('hidden');
                editor.classList.remove('hidden');
                modeIndicator.textContent = 'Edit';
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'loadContent':
                    placeholder.classList.add('hidden');
                    editor.classList.remove('hidden');
                    preview.classList.add('hidden');  // Hide preview
                    preview.innerHTML = '';           // Clear old preview content
                    mermaidId = 0;                    // Reset mermaid counter
                    editor.value = message.content;
                    filename.textContent = message.filename;
                    hasFile = true;
                    isPreviewMode = false;
                    modeIndicator.textContent = 'Edit';
                    break;
                case 'togglePreview':
                    if (hasFile) {
                        isPreviewMode = !isPreviewMode;
                        updateView();
                    }
                    break;
            }
        });

        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
