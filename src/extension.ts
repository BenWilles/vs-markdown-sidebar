import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new MarkdownEditorProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MarkdownEditorProvider.viewType,
            provider
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownSidebar.open', () => {
            provider.openFile();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownSidebar.recentFiles', () => {
            provider.showRecentFiles();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownSidebar.togglePreview', () => {
            provider.togglePreview();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownSidebar.openFromExplorer', (uri: vscode.Uri) => {
            provider.openFileFromUri(uri);
        })
    );
}

export function deactivate() {}
