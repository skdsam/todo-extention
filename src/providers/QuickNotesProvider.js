const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Tree data provider for the Quick Notes sidebar
 */
class QuickNotesProvider {
    constructor(dataManager, projectTracker) {
        this.dataManager = dataManager;
        this.projectTracker = projectTracker;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.projects = [];
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    async refreshProjects() {
        try {
            // Get projects from project-tracker
            const trackedProjects = await this.projectTracker.getProjects();

            // Get existing projects from data manager (to keep manually added ones)
            const storedData = this.dataManager.getData();
            const storedProjects = storedData.projects || {};

            // Map tracked projects to our format
            const detectedProjects = trackedProjects.map(project => ({
                ...project,
                id: this.generateProjectId(project.path),
                isStale: !fs.existsSync(project.path)
            }));

            // Create a map of all projects, preferring detected ones if they exist
            // but keeping stored ones if they are manual additions
            const allProjectsMap = new Map();

            // Add stored projects first
            Object.entries(storedProjects).forEach(([id, proj]) => {
                allProjectsMap.set(id, {
                    ...proj,
                    id,
                    isStale: !fs.existsSync(proj.path)
                });
            });

            // Merge/Overwrite with detected projects
            detectedProjects.forEach(proj => {
                allProjectsMap.set(proj.id, proj);
            });

            this.projects = Array.from(allProjectsMap.values());

            // Sync back to data manager to ensure all are persisted
            const projectSpecs = this.projects.map(project => ({
                id: project.id,
                projectInfo: {
                    name: project.name,
                    path: project.path,
                    icon: project.icon,
                    color: project.color
                }
            }));
            
            await this.dataManager.batchEnsureProjects(projectSpecs);

        } catch (error) {
            console.error('Failed to refresh projects:', error);
            vscode.window.showErrorMessage('Failed to load projects from project-tracker');
        }
    }

    generateProjectId(projectPath) {
        // Create a consistent ID from the path
        return Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '_');
    }

    getProjects() {
        return this.projects;
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            // Root level - return projects
            return this.getProjectItems();
        } else if (element.type === 'project') {
            // Project level - return notes
            return this.getNoteItems(element.projectId);
        }
        return [];
    }

    getProjectItems() {
        const config = vscode.workspace.getConfiguration('quickNotes');

        return this.projects
            .filter(project => !project.isStale)
            .map(project => {
                const notes = this.dataManager.getNotesForProject(project.id);
                const incompleteCount = notes.filter(n => !n.completed).length;

                const item = new vscode.TreeItem(
                    project.name,
                    vscode.TreeItemCollapsibleState.Expanded
                );

                item.type = 'project';
                item.projectId = project.id;
                item.path = project.path;

                // Show note count
                if (incompleteCount > 0) {
                    item.description = `${incompleteCount} todo${incompleteCount !== 1 ? 's' : ''}`;
                }

                // Icon based on project status
                if (project.isStale) {
                    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                    item.tooltip = `⚠️ Project folder not found: ${project.path}`;
                    item.contextValue = 'staleProject';
                } else {
                    // Use project's custom icon if available
                    if (project.icon) {
                        item.iconPath = new vscode.ThemeIcon(
                            project.icon,
                            project.color ? new vscode.ThemeColor(project.color) : undefined
                        );
                    } else {
                        item.iconPath = new vscode.ThemeIcon('folder');
                    }
                    item.tooltip = project.path;
                    item.contextValue = 'project';
                }

                return item;
            });
    }

    getNoteItems(projectId) {
        const config = vscode.workspace.getConfiguration('quickNotes');
        const showCompleted = config.get('showCompletedNotes', true);
        const sortBy = config.get('sortBy', 'priority');

        let notes = this.dataManager.getNotesForProject(projectId);

        // Filter completed if needed
        if (!showCompleted) {
            notes = notes.filter(n => !n.completed);
        }

        // Sort notes
        notes = this.sortNotes(notes, sortBy);

        return notes.map(note => {
            const item = new vscode.TreeItem(
                note.title || note.tag || note.content,
                vscode.TreeItemCollapsibleState.None
            );

            item.type = 'note';
            item.noteId = note.id;
            item.projectId = projectId;

            // Priority icons
            const priorityIcons = {
                high: '🔴',
                medium: '🟡',
                low: '🟢'
            };

            // Completed styling
            if (note.completed) {
                item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                item.description = '✓ Done';
            } else {
                item.description = priorityIcons[note.priority] || '🟡';

                // Different icon based on priority
                const iconMap = {
                    high: 'flame',
                    medium: 'circle-outline',
                    low: 'circle-small'
                };
                item.iconPath = new vscode.ThemeIcon(iconMap[note.priority] || 'circle-outline');
            }

            item.tooltip = this.formatNoteTooltip(note);
            item.contextValue = 'note';

            return item;
        });
    }

    sortNotes(notes, sortBy) {
        const priorityOrder = {
            high: 0,
            medium: 1,
            low: 2
        };

        return [...notes].sort((a, b) => {
            // Completed items always at bottom
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            switch (sortBy) {
                case 'priority':
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                case 'createdAt':
                    return new Date(b.createdAt) - new Date(a.createdAt);
                case 'alphabetical':
                    const labelA = a.title || a.tag || a.content || '';
                    const labelB = b.title || b.tag || b.content || '';
                    return labelA.localeCompare(labelB);
                default:
                    return 0;
            }
        });
    }

    formatNoteTooltip(note) {
        const lines = [
            note.title || note.tag || '',
            note.description || note.content || '',
            '',
            `Priority: ${note.priority}`,
            `Status: ${note.completed ? 'Completed' : 'Pending'}`,
            `Created: ${new Date(note.createdAt).toLocaleDateString()}`
        ];

        if (note.updatedAt !== note.createdAt) {
            lines.push(`Updated: ${new Date(note.updatedAt).toLocaleDateString()}`);
        }

        return lines.join('\n');
    }
}

module.exports = {
    QuickNotesProvider
};