const vscode = require('vscode');

class SyncPanel {
    static currentPanel = undefined;
    static viewType = 'syncSettings';

    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SyncPanel.currentPanel) {
            SyncPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            SyncPanel.viewType,
            'GitHub Sync Setup',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        SyncPanel.currentPanel = new SyncPanel(panel, extensionUri);
    }

    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, []);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getToken':
                        vscode.env.openExternal(vscode.Uri.parse(
                            'https://github.com/settings/tokens/new?scopes=repo&description=Quick%20Notes%20VS%20Code%20Extension'
                        ));
                        return;
                    case 'saveSettings':
                        try {
                            const config = vscode.workspace.getConfiguration('quickNotes.sync');
                            await config.update('repoUrl', message.repoUrl, vscode.ConfigurationTarget.Global);
                            await config.update('token', message.token, vscode.ConfigurationTarget.Global);
                            await config.update('enabled', true, vscode.ConfigurationTarget.Global);
                            
                            vscode.window.showInformationMessage('Sync settings saved successfully!');
                            this._panel.dispose();
                            
                            // Trigger an initial sync check
                            vscode.commands.executeCommand('quickNotes.syncNow');
                        } catch (err) {
                            vscode.window.showErrorMessage('Error saving settings: ' + err.message);
                        }
                        return;
                    case 'cancel':
                        this._panel.dispose();
                        return;
                }
            },
            null,
            []
        );
    }

    dispose() {
        SyncPanel.currentPanel = undefined;
        this._panel.dispose();
    }

    _update() {
        const config = vscode.workspace.getConfiguration('quickNotes.sync');
        const repoUrl = config.get('repoUrl', '');
        const token = config.get('token', '');

        this._panel.webview.html = this._getHtmlForWebview(repoUrl, token);
    }

    _getHtmlForWebview(repoUrl, token) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>GitHub Sync Setup</title>
                <style>
                    :root {
                        --padding: 24px;
                        --border-radius: 8px;
                    }
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 0;
                        margin: 0;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        display: flex;
                        justify-content: center;
                        align-items: flex-start;
                        min-height: 100vh;
                    }
                    .container {
                        width: 100%;
                        max-width: 600px;
                        margin: 40px 20px;
                        background: var(--vscode-sideBar-background);
                        border-radius: var(--border-radius);
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        border: 1px solid var(--vscode-widget-border);
                    }
                    .header {
                        padding: var(--padding);
                        background: linear-gradient(135deg, #24292e, #444d56);
                        color: white;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .header h2 {
                        margin: 0;
                        font-size: 20px;
                        font-weight: 600;
                    }
                    .content-area {
                        padding: var(--padding);
                        display: flex;
                        flex-direction: column;
                        gap: 24px;
                    }
                    .info-box {
                        background-color: var(--vscode-textBlockQuote-background);
                        border-left: 4px solid var(--vscode-textBlockQuote-border);
                        padding: 12px 16px;
                        margin-bottom: 8px;
                        font-size: 13px;
                        line-height: 1.5;
                    }
                    .field {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    label {
                        font-weight: 600;
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        color: var(--vscode-descriptionForeground);
                    }
                    input {
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 12px 16px;
                        border-radius: 6px;
                        font-family: inherit;
                        font-size: 14px;
                    }
                    input:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }
                    .token-help {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-top: 4px;
                    }
                    .help-text {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .btn-link {
                        background: none;
                        border: none;
                        color: var(--vscode-textLink-foreground);
                        cursor: pointer;
                        padding: 0;
                        font-size: 12px;
                        text-decoration: underline;
                    }
                    .btn-link:hover {
                        color: var(--vscode-textLink-activeForeground);
                    }
                    .footer {
                        padding: var(--padding);
                        background-color: var(--vscode-sideBar-background);
                        border-top: 1px solid var(--vscode-widget-border);
                        display: flex;
                        justify-content: flex-end;
                        gap: 12px;
                    }
                    button {
                        padding: 10px 20px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        border: none;
                        font-size: 13px;
                        transition: all 0.2s;
                    }
                    .btn-primary {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .btn-primary:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .btn-secondary {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .btn-secondary:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                    .icon {
                        font-size: 24px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <span class="icon">🔄</span>
                        <h2>GitHub Sync Setup</h2>
                    </div>
                    
                    <div class="content-area">
                        <div class="info-box">
                            Sync your notes across devices by connecting to a GitHub repository. 
                            Your data will be stored in a file named <code>notes.json</code> in the root of your repo.
                        </div>

                        <div class="field">
                            <label for="repoUrl">GitHub Repository URL</label>
                            <input type="text" id="repoUrl" placeholder="https://github.com/username/repo" value="${repoUrl}">
                            <span class="help-text">Create a repository first if you don't have one.</span>
                        </div>
                        
                        <div class="field">
                            <label for="token">Personal Access Token (PAT)</label>
                            <input type="password" id="token" placeholder="ghp_xxxxxxxxxxxx" value="${token}">
                            <div class="token-help">
                                <span class="help-text">Requires <code>repo</code> scope.</span>
                                <button class="btn-link" id="getTokenBtn">Get a token from GitHub →</button>
                            </div>
                        </div>
                    </div>

                    <div class="footer">
                        <button class="btn-secondary" id="cancelBtn">Cancel</button>
                        <button class="btn-primary" id="saveBtn">Enable Sync</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    document.getElementById('getTokenBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'getToken' });
                    });

                    document.getElementById('saveBtn').addEventListener('click', () => {
                        const repoUrl = document.getElementById('repoUrl').value.trim();
                        const token = document.getElementById('token').value.trim();
                        
                        if (!repoUrl || !token) {
                            alert('Both Repository URL and Token are required.');
                            return;
                        }

                        vscode.postMessage({
                            command: 'saveSettings',
                            repoUrl,
                            token
                        });
                    });

                    document.getElementById('cancelBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'cancel' });
                    });
                </script>
            </body>
            </html>`;
    }
}

module.exports = { SyncPanel };
