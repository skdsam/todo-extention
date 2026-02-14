const vscode = require('vscode');

class NoteEditorPanel {
    static currentPanel = undefined;
    static viewType = 'noteEditor';

    static createOrShow(extensionUri, dataManager, quickNotesProvider, projectId, noteId = null) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (NoteEditorPanel.currentPanel) {
            NoteEditorPanel.currentPanel._panel.reveal(column);
            NoteEditorPanel.currentPanel._update(projectId, noteId);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            NoteEditorPanel.viewType,
            noteId ? 'Edit Note' : 'Add New Note',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        NoteEditorPanel.currentPanel = new NoteEditorPanel(panel, extensionUri, dataManager, quickNotesProvider, projectId, noteId);
    }

    constructor(panel, extensionUri, dataManager, quickNotesProvider, projectId, noteId) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._dataManager = dataManager;
        this._quickNotesProvider = quickNotesProvider;
        this._projectId = projectId;
        this._noteId = noteId;

        this._update(projectId, noteId);

        this._panel.onDidDispose(() => this.dispose(), null, []);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'saveNote':
                        try {
                            if (this._noteId) {
                                await this._dataManager.updateNote(this._projectId, this._noteId, {
                                    title: message.title,
                                    description: message.description,
                                    priority: message.priority
                                });
                            } else {
                                await this._dataManager.addNote(this._projectId, {
                                    title: message.title,
                                    description: message.description,
                                    priority: message.priority
                                });
                            }
                            this._quickNotesProvider.refresh();
                            this._panel.dispose();
                            vscode.window.showInformationMessage(this._noteId ? 'Note updated!' : 'Note added!');
                        } catch (err) {
                            vscode.window.showErrorMessage('Error saving note: ' + err.message);
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
        NoteEditorPanel.currentPanel = undefined;
        this._panel.dispose();
    }

    _update(projectId, noteId) {
        this._projectId = projectId;
        this._noteId = noteId;
        const note = noteId ? this._dataManager.getNote(projectId, noteId) : null;
        this._panel.title = noteId ? 'Edit Note' : 'Add New Note';
        this._panel.webview.html = this._getHtmlForWebview(note);
    }

    _getHtmlForWebview(note) {
        const title = note ? (note.title || note.tag || '') : '';
        const description = note ? (note.description || note.content || '') : '';
        const priority = note ? note.priority : 'medium';

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Note Editor</title>
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
                        max-width: 700px;
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
                        background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-progressBar-background));
                        color: var(--vscode-button-foreground);
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
                    input, textarea {
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 12px 16px;
                        border-radius: 6px;
                        font-family: inherit;
                        font-size: 14px;
                        transition: border-color 0.2s, box-shadow 0.2s;
                    }
                    input:focus, textarea:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                        box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
                    }
                    textarea {
                        min-height: 250px;
                        resize: vertical;
                        line-height: 1.5;
                    }
                    .priority-group {
                        display: flex;
                        gap: 8px;
                    }
                    .priority-btn {
                        flex: 1;
                        padding: 10px;
                        text-align: center;
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 6px;
                        cursor: pointer;
                        background: var(--vscode-input-background);
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 13px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                    }
                    .priority-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .priority-btn.active {
                        border-color: transparent;
                        color: white;
                        font-weight: 600;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    }
                    .priority-btn[data-priority="high"].active {
                        background: #e51400;
                    }
                    .priority-btn[data-priority="medium"].active {
                        background: #cca700;
                    }
                    .priority-btn[data-priority="low"].active {
                        background: #75b739;
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
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>${note ? 'Update Note' : 'Create New Note'}</h2>
                    </div>
                    
                    <div class="content-area">
                        <div class="field">
                            <label for="title">Title</label>
                            <input type="text" id="title" placeholder="What needs to be done?" value="${title}">
                        </div>
                        
                        <div class="field">
                            <label>Priority Level</label>
                            <div class="priority-group" id="priorityGroup">
                                <div class="priority-btn ${priority === 'high' ? 'active' : ''}" data-priority="high">[!] High</div>
                                <div class="priority-btn ${priority === 'medium' ? 'active' : ''}" data-priority="medium">[-] Medium</div>
                                <div class="priority-btn ${priority === 'low' ? 'active' : ''}" data-priority="low">[.] Low</div>
                            </div>
                        </div>

                        <div class="field">
                            <label for="description">Description</label>
                            <textarea id="description" placeholder="Type your detailed notes here...">${description}</textarea>
                        </div>
                    </div>

                    <div class="footer">
                        <button class="btn-secondary" id="cancelBtn">Cancel</button>
                        <button class="btn-primary" id="saveBtn">${note ? 'Save Changes' : 'Add Note'}</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedPriority = '${priority}';

                    // Priority selection
                    document.querySelectorAll('.priority-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            selectedPriority = btn.getAttribute('data-priority');
                        });
                    });

                    // Save
                    document.getElementById('saveBtn').addEventListener('click', () => {
                        const title = document.getElementById('title').value;
                        const description = document.getElementById('description').value;
                        
                        if (!title || !description) {
                            alert('Title and Description are required');
                            return;
                        }

                        vscode.postMessage({
                            command: 'saveNote',
                            title,
                            description,
                            priority: selectedPriority
                        });
                    });

                    // Cancel
                    document.getElementById('cancelBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'cancel' });
                    });

                    // Focus title input on load
                    window.onload = () => {
                        document.getElementById('title').focus();
                    };
                </script>
            </body>
            </html>`;
    }
}

module.exports = { NoteEditorPanel };
