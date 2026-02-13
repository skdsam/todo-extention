const vscode = require('vscode');
const {
    QuickNotesProvider
} = require('./providers/QuickNotesProvider');
const {
    NotesDataManager
} = require('./data/NotesDataManager');
const {
    ProjectTracker
} = require('./integrations/ProjectTracker');
const {
    GitHubSyncManager
} = require('./sync/GitHubSyncManager');
const {
    SyncPanel
} = require('./panels/SyncPanel');

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log('Quick Notes extension is trying to activate...');

    try {
        // Initialize the data manager (uses VS Code sync-compatible globalState)
        const dataManager = new NotesDataManager(context);

        // Register keys for VS Code Settings Sync
        context.globalState.setKeysForSync(['quickNotes.data']);

        // Initialize GitHub sync manager
        const syncManager = new GitHubSyncManager(context);
        dataManager.setSyncManager(syncManager);

        // Create sync status bar item
        const syncStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 100
        );
        syncStatusBar.command = 'quickNotes.syncNow';
        updateSyncStatusBar(syncStatusBar, 'idle');
        syncStatusBar.show();

        // Listen for sync status changes
        syncManager.onSyncStatusChanged((status) => {
            updateSyncStatusBar(syncStatusBar, status);
        });

        // Pull remote data on activation (merge with local)
        if (syncManager.isConfigured()) {
            try {
                const remoteData = await syncManager.pull();
                if (remoteData) {
                    const localData = dataManager.exportData();
                    const merged = syncManager.mergeData(localData, remoteData);
                    await dataManager.importData(merged);
                    updateSyncStatusBar(syncStatusBar, 'synced');
                    console.log('Quick Notes: Initial sync complete');
                }
            } catch (err) {
                console.error('Quick Notes: Initial sync failed:', err.message);
                updateSyncStatusBar(syncStatusBar, 'error');
            }
        } else {
            updateSyncStatusBar(syncStatusBar, 'not-configured');
        }

        // Set up auto-sync interval
        const config = vscode.workspace.getConfiguration('quickNotes.sync');
        const intervalMinutes = config.get('autoSyncInterval', 5);
        let autoSyncTimer = null;

        if (syncManager.isConfigured() && intervalMinutes > 0) {
            autoSyncTimer = setInterval(async () => {
                try {
                    const localData = dataManager.exportData();
                    const merged = await syncManager.sync(localData);
                    await dataManager.importData(merged);
                    quickNotesProvider.refresh();
                } catch (err) {
                    console.error('Quick Notes: Auto-sync failed:', err.message);
                }
            }, intervalMinutes * 60 * 1000);
        }

        // Initialize project tracker integration
        const projectTracker = new ProjectTracker();

        // Initialize the tree view provider
        const quickNotesProvider = new QuickNotesProvider(dataManager, projectTracker);

        // Register the tree view
        const treeView = vscode.window.createTreeView('quickNotesView', {
            treeDataProvider: quickNotesProvider,
            showCollapseAll: true
        });

        // Register commands
        const commands = [
            vscode.commands.registerCommand('quickNotes.addNote', async (item) => {
                try {
                    const projectId = item?.projectId || await selectProject(quickNotesProvider);
                    if (!projectId) return;

                    const content = await vscode.window.showInputBox({
                        prompt: 'Enter note content',
                        placeHolder: 'What needs to be done?'
                    });

                    if (content) {
                        const config = vscode.workspace.getConfiguration('quickNotes');
                        const defaultPriority = config.get('defaultPriority', 'medium');

                        await dataManager.addNote(projectId, {
                            content,
                            priority: defaultPriority
                        });
                        quickNotesProvider.refresh();
                        vscode.window.showInformationMessage('Note added successfully!');
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to add note: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.addProject', async () => {
                try {
                    const folder = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Add Project'
                    });

                    if (folder && folder[0]) {
                        const path = folder[0].fsPath;
                        const name = path.split(/[\\/]/).pop();
                        const id = Buffer.from(path).toString('base64').replace(/[/+=]/g, '_');

                        dataManager.ensureProject(id, {
                            name,
                            path,
                            icon: 'folder',
                            color: 'charts.blue'
                        });

                        await quickNotesProvider.refreshProjects();
                        quickNotesProvider.refresh();
                        vscode.window.showInformationMessage(`Project "${name}" added!`);
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to add project: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.editNote', async (item) => {
                if (!item?.noteId) return;

                try {
                    const currentNote = dataManager.getNote(item.projectId, item.noteId);
                    if (!currentNote) return;

                    const content = await vscode.window.showInputBox({
                        prompt: 'Edit note content',
                        value: currentNote.content
                    });

                    if (content !== undefined) {
                        await dataManager.updateNote(item.projectId, item.noteId, {
                            content
                        });
                        quickNotesProvider.refresh();
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to edit note: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.deleteNote', async (item) => {
                if (!item?.noteId) return;

                const confirm = await vscode.window.showWarningMessage(
                    'Are you sure you want to delete this note?',
                    'Yes', 'No'
                );

                if (confirm === 'Yes') {
                    try {
                        await dataManager.deleteNote(item.projectId, item.noteId);
                        quickNotesProvider.refresh();
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to delete note: ${err.message}`);
                    }
                }
            }),

            vscode.commands.registerCommand('quickNotes.toggleComplete', async (item) => {
                if (!item?.noteId) return;

                try {
                    const currentNote = dataManager.getNote(item.projectId, item.noteId);
                    if (!currentNote) return;

                    await dataManager.updateNote(item.projectId, item.noteId, {
                        completed: !currentNote.completed
                    });
                    quickNotesProvider.refresh();
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to toggle completion: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.setPriority', async (item) => {
                if (!item?.noteId) return;

                const priority = await vscode.window.showQuickPick(
                    [{
                            label: '🔴 High',
                            value: 'high'
                        },
                        {
                            label: '🟡 Medium',
                            value: 'medium'
                        },
                        {
                            label: '🟢 Low',
                            value: 'low'
                        }
                    ], {
                        placeHolder: 'Select priority'
                    }
                );

                if (priority) {
                    try {
                        await dataManager.updateNote(item.projectId, item.noteId, {
                            priority: priority.value
                        });
                        quickNotesProvider.refresh();
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to set priority: ${err.message}`);
                    }
                }
            }),

            vscode.commands.registerCommand('quickNotes.refresh', async () => {
                try {
                    await quickNotesProvider.refreshProjects();
                    quickNotesProvider.refresh();
                    vscode.window.showInformationMessage('Projects refreshed!');
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to refresh projects: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.removeStaleProject', async (item) => {
                if (!item?.projectId) return;

                const confirm = await vscode.window.showWarningMessage(
                    'Remove this stale project and all its notes?',
                    'Yes', 'No'
                );

                if (confirm === 'Yes') {
                    try {
                        await dataManager.removeProject(item.projectId);
                        quickNotesProvider.refresh();
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to remove project: ${err.message}`);
                    }
                }
            }),

            vscode.commands.registerCommand('quickNotes.archiveProject', async (item) => {
                if (!item?.projectId) return;

                try {
                    await dataManager.archiveProject(item.projectId);
                    quickNotesProvider.refresh();
                    vscode.window.showInformationMessage('Project archived. Notes preserved.');
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to archive project: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.updateProjectPath', async (item) => {
                if (!item?.projectId) return;

                const newPath = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select New Location'
                });

                if (newPath && newPath[0]) {
                    try {
                        await dataManager.updateProjectPath(item.projectId, newPath[0].fsPath);
                        quickNotesProvider.refresh();
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to update path: ${err.message}`);
                    }
                }
            }),

            vscode.commands.registerCommand('quickNotes.openProject', async (item) => {
                if (!item?.path) return;

                try {
                    const uri = vscode.Uri.file(item.path);
                    await vscode.commands.executeCommand('vscode.openFolder', uri, {
                        forceNewWindow: false
                    });
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to open project: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.viewArchived', async () => {
                try {
                    const archived = dataManager.getArchivedProjects();

                    if (Object.keys(archived).length === 0) {
                        vscode.window.showInformationMessage('No archived projects');
                        return;
                    }

                    const items = Object.entries(archived).map(([id, project]) => ({
                        label: project.name,
                        description: `${project.notes?.length || 0} notes`,
                        projectId: id
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select a project to restore or view'
                    });

                    if (selected) {
                        const action = await vscode.window.showQuickPick(
                            ['Restore Project', 'View Notes', 'Delete Permanently'], {
                                placeHolder: 'What would you like to do?'
                            }
                        );

                        if (action === 'Restore Project') {
                            await dataManager.restoreProject(selected.projectId);
                            quickNotesProvider.refresh();
                        } else if (action === 'View Notes') {
                            const project = archived[selected.projectId];
                            const notesList = project.notes?.map(n => `• ${n.content}`).join('\n') || 'No notes';
                            vscode.window.showInformationMessage(notesList, {
                                modal: true
                            });
                        } else if (action === 'Delete Permanently') {
                            await dataManager.deleteArchivedProject(selected.projectId);
                            vscode.window.showInformationMessage('Project permanently deleted');
                        }
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to view archived: ${err.message}`);
                }
            }),

            vscode.commands.registerCommand('quickNotes.configureSync', () => {
                SyncPanel.createOrShow(context.extensionUri);
            }),

            vscode.commands.registerCommand('quickNotes.syncNow', async () => {
                if (!syncManager.isConfigured()) {
                    const action = await vscode.window.showWarningMessage(
                        'GitHub sync is not configured. Setup your repo URL and token in the sync panel.',
                        'Configure Sync',
                        'Open Settings'
                    );
                    if (action === 'Configure Sync') {
                        vscode.commands.executeCommand('quickNotes.configureSync');
                    } else if (action === 'Open Settings') {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'quickNotes.sync'
                        );
                    }
                    return;
                }

                try {
                    updateSyncStatusBar(syncStatusBar, 'syncing');
                    const localData = dataManager.exportData();
                    const merged = await syncManager.sync(localData);
                    await dataManager.importData(merged);
                    quickNotesProvider.refresh();
                    updateSyncStatusBar(syncStatusBar, 'synced');
                    vscode.window.showInformationMessage('Quick Notes synced successfully!');
                } catch (err) {
                    updateSyncStatusBar(syncStatusBar, 'error');
                    vscode.window.showErrorMessage(`Sync failed: ${err.message}`);
                }
            })
        ];

        context.subscriptions.push(treeView, syncStatusBar, ...commands);

        // Clean up auto-sync timer on deactivation
        context.subscriptions.push({
            dispose: () => {
                if (autoSyncTimer) {
                    clearInterval(autoSyncTimer);
                }
            }
        });

        // Initial refresh to load projects
        await quickNotesProvider.refreshProjects();
        console.log('Quick Notes extension is now active!');
    } catch (error) {
        console.error('Failed to activate Quick Notes extension:', error);
        vscode.window.showErrorMessage(`Quick Notes failed to start: ${error.message}`);
    }
}

/**
 * Helper to select a project when adding a note from the title bar
 */
async function selectProject(provider) {
    const projects = provider.getProjects();

    if (projects.length === 0) {
        vscode.window.showWarningMessage('No projects available. Make sure project-tracker extension is installed.');
        return null;
    }

    const selected = await vscode.window.showQuickPick(
        projects.map(p => ({
            label: p.name,
            projectId: p.id
        })), {
            placeHolder: 'Select a project to add note to'
        }
    );

    return selected?.projectId;
}

function deactivate() {
    console.log('Quick Notes extension deactivated');
}

/**
 * Update the sync status bar display
 */
function updateSyncStatusBar(statusBar, status) {
    switch (status) {
        case 'syncing':
            statusBar.text = '$(sync~spin) Syncing...';
            statusBar.tooltip = 'Quick Notes: Syncing with GitHub...';
            break;
        case 'synced':
            statusBar.text = '$(check) Notes Synced';
            statusBar.tooltip = `Quick Notes: Synced at ${new Date().toLocaleTimeString()}`;
            break;
        case 'error':
            statusBar.text = '$(warning) Sync Error';
            statusBar.tooltip = 'Quick Notes: Sync failed. Click to retry.';
            break;
        case 'not-configured':
            statusBar.text = '$(cloud-upload) Setup Sync';
            statusBar.tooltip = 'Quick Notes: Click to configure GitHub sync';
            break;
        default:
            statusBar.text = '$(cloud) Notes Sync';
            statusBar.tooltip = 'Quick Notes: Click to sync now';
            break;
    }
}

module.exports = {
    activate,
    deactivate
};