const vscode = require('vscode');
const { QuickNotesProvider } = require('./providers/QuickNotesProvider');
const { NotesDataManager } = require('./data/NotesDataManager');
const { ProjectTracker } = require('./integrations/ProjectTracker');

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log('Quick Notes extension is now active!');

    // Initialize the data manager (uses VS Code sync-compatible globalState)
    const dataManager = new NotesDataManager(context);
    
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
        }),
        
        vscode.commands.registerCommand('quickNotes.editNote', async (item) => {
            if (!item?.noteId) return;
            
            const currentNote = dataManager.getNote(item.projectId, item.noteId);
            if (!currentNote) return;
            
            const content = await vscode.window.showInputBox({
                prompt: 'Edit note content',
                value: currentNote.content
            });
            
            if (content !== undefined) {
                await dataManager.updateNote(item.projectId, item.noteId, { content });
                quickNotesProvider.refresh();
            }
        }),
        
        vscode.commands.registerCommand('quickNotes.deleteNote', async (item) => {
            if (!item?.noteId) return;
            
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to delete this note?',
                'Yes', 'No'
            );
            
            if (confirm === 'Yes') {
                await dataManager.deleteNote(item.projectId, item.noteId);
                quickNotesProvider.refresh();
            }
        }),
        
        vscode.commands.registerCommand('quickNotes.toggleComplete', async (item) => {
            if (!item?.noteId) return;
            
            const currentNote = dataManager.getNote(item.projectId, item.noteId);
            if (!currentNote) return;
            
            await dataManager.updateNote(item.projectId, item.noteId, {
                completed: !currentNote.completed
            });
            quickNotesProvider.refresh();
        }),
        
        vscode.commands.registerCommand('quickNotes.setPriority', async (item) => {
            if (!item?.noteId) return;
            
            const priority = await vscode.window.showQuickPick(
                [
                    { label: '🔴 High', value: 'high' },
                    { label: '🟡 Medium', value: 'medium' },
                    { label: '🟢 Low', value: 'low' }
                ],
                { placeHolder: 'Select priority' }
            );
            
            if (priority) {
                await dataManager.updateNote(item.projectId, item.noteId, {
                    priority: priority.value
                });
                quickNotesProvider.refresh();
            }
        }),
        
        vscode.commands.registerCommand('quickNotes.refresh', async () => {
            await quickNotesProvider.refreshProjects();
            quickNotesProvider.refresh();
            vscode.window.showInformationMessage('Projects refreshed!');
        }),
        
        vscode.commands.registerCommand('quickNotes.removeStaleProject', async (item) => {
            if (!item?.projectId) return;
            
            const confirm = await vscode.window.showWarningMessage(
                'Remove this stale project and all its notes?',
                'Yes', 'No'
            );
            
            if (confirm === 'Yes') {
                await dataManager.removeProject(item.projectId);
                quickNotesProvider.refresh();
            }
        }),
        
        vscode.commands.registerCommand('quickNotes.archiveProject', async (item) => {
            if (!item?.projectId) return;
            
            await dataManager.archiveProject(item.projectId);
            quickNotesProvider.refresh();
            vscode.window.showInformationMessage('Project archived. Notes preserved.');
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
                await dataManager.updateProjectPath(item.projectId, newPath[0].fsPath);
                quickNotesProvider.refresh();
            }
        }),
        
        vscode.commands.registerCommand('quickNotes.openProject', async (item) => {
            if (!item?.path) return;
            
            const uri = vscode.Uri.file(item.path);
            await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
        }),
        
        vscode.commands.registerCommand('quickNotes.viewArchived', async () => {
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
                    ['Restore Project', 'View Notes', 'Delete Permanently'],
                    { placeHolder: 'What would you like to do?' }
                );
                
                if (action === 'Restore Project') {
                    await dataManager.restoreProject(selected.projectId);
                    quickNotesProvider.refresh();
                } else if (action === 'View Notes') {
                    const project = archived[selected.projectId];
                    const notesList = project.notes?.map(n => `• ${n.content}`).join('\n') || 'No notes';
                    vscode.window.showInformationMessage(notesList, { modal: true });
                } else if (action === 'Delete Permanently') {
                    await dataManager.deleteArchivedProject(selected.projectId);
                    vscode.window.showInformationMessage('Project permanently deleted');
                }
            }
        })
    ];
    
    context.subscriptions.push(treeView, ...commands);
    
    // Initial refresh to load projects
    await quickNotesProvider.refreshProjects();
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
        projects.map(p => ({ label: p.name, projectId: p.id })),
        { placeHolder: 'Select a project to add note to' }
    );
    
    return selected?.projectId;
}

function deactivate() {
    console.log('Quick Notes extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
