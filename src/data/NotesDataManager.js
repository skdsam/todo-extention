const vscode = require('vscode');


/**
 * Manages notes data using VS Code globalState for Settings Sync compatibility
 */
class NotesDataManager {
    constructor(context) {
        this.context = context;
        this.STORAGE_KEY = 'quickNotes.data';
        this.syncManager = null;
    }

    /**
     * Set the sync manager for GitHub sync
     */
    setSyncManager(syncManager) {
        this.syncManager = syncManager;
    }

    /**
     * Get all stored data
     */
    getData() {
        return this.context.globalState.get(this.STORAGE_KEY, {
            version: '1.0.0',
            projects: {},
            archivedProjects: {}
        });
    }

    /**
     * Save all data (and trigger background sync if configured)
     */
    async saveData(data) {
        await this.context.globalState.update(this.STORAGE_KEY, data);

        // Trigger background push to GitHub (fire-and-forget)
        if (this.syncManager && this.syncManager.isConfigured()) {
            this.syncManager.push(data).catch(err => {
                console.error('Background sync push failed:', err.message);
            });
        }
    }

    /**
     * Export all data for sync
     */
    exportData() {
        return this.getData();
    }

    /**
     * Import data from sync (replaces local state)
     */
    async importData(data) {
        await this.context.globalState.update(this.STORAGE_KEY, data);
    }

    /**
     * Ensure a project exists in our data store
     */
    ensureProject(projectId, projectInfo) {
        const data = this.getData();

        if (!data.projects[projectId]) {
            data.projects[projectId] = {
                ...projectInfo,
                notes: [],
                createdAt: new Date().toISOString()
            };
        } else {
            // Update project info but keep notes
            const existingNotes = data.projects[projectId].notes;
            data.projects[projectId] = {
                ...data.projects[projectId],
                ...projectInfo,
                notes: existingNotes
            };
        }
        this.saveData(data);
    }

    /**
     * Get notes for a specific project
     */
    getNotesForProject(projectId) {
        const data = this.getData();
        return data.projects[projectId]?.notes || [];
    }

    /**
     * Get a specific note
     */
    getNote(projectId, noteId) {
        const notes = this.getNotesForProject(projectId);
        return notes.find(n => n.id === noteId);
    }

    /**
     * Add a new note to a project
     */
    async addNote(projectId, noteData) {
        const data = this.getData();

        if (!data.projects[projectId]) {
            throw new Error('Project not found');
        }

        const note = {
            id: this.generateId(),
            content: noteData.content,
            priority: noteData.priority || 'medium',
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        data.projects[projectId].notes.push(note);
        await this.saveData(data);

        return note;
    }

    /**
     * Update an existing note
     */
    async updateNote(projectId, noteId, updates) {
        const data = this.getData();

        if (!data.projects[projectId]) {
            throw new Error('Project not found');
        }

        const noteIndex = data.projects[projectId].notes.findIndex(n => n.id === noteId);

        if (noteIndex === -1) {
            throw new Error('Note not found');
        }

        data.projects[projectId].notes[noteIndex] = {
            ...data.projects[projectId].notes[noteIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await this.saveData(data);

        return data.projects[projectId].notes[noteIndex];
    }

    /**
     * Delete a note
     */
    async deleteNote(projectId, noteId) {
        const data = this.getData();

        if (!data.projects[projectId]) {
            throw new Error('Project not found');
        }

        data.projects[projectId].notes = data.projects[projectId].notes.filter(
            n => n.id !== noteId
        );

        await this.saveData(data);
    }

    /**
     * Remove a project and all its notes
     */
    async removeProject(projectId) {
        const data = this.getData();
        delete data.projects[projectId];
        await this.saveData(data);
    }

    /**
     * Archive a project (preserve notes, remove from active list)
     */
    async archiveProject(projectId) {
        const data = this.getData();

        if (data.projects[projectId]) {
            data.archivedProjects[projectId] = {
                ...data.projects[projectId],
                archivedAt: new Date().toISOString()
            };
            delete data.projects[projectId];
            await this.saveData(data);
        }
    }

    /**
     * Restore a project from archive
     */
    async restoreProject(projectId) {
        const data = this.getData();

        if (data.archivedProjects[projectId]) {
            data.projects[projectId] = {
                ...data.archivedProjects[projectId]
            };
            delete data.projects[projectId].archivedAt;
            delete data.archivedProjects[projectId];
            await this.saveData(data);
        }
    }

    /**
     * Get all archived projects
     */
    getArchivedProjects() {
        const data = this.getData();
        return data.archivedProjects || {};
    }

    /**
     * Delete an archived project permanently
     */
    async deleteArchivedProject(projectId) {
        const data = this.getData();
        delete data.archivedProjects[projectId];
        await this.saveData(data);
    }

    /**
     * Update a project's path (for relocated projects)
     */
    async updateProjectPath(projectId, newPath) {
        const data = this.getData();

        if (data.projects[projectId]) {
            data.projects[projectId].path = newPath;
            await this.saveData(data);
        }
    }

    /**
     * Generate a unique ID
     */
    generateId() {
        // Simple UUID-like ID generator
        return 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }
}

module.exports = {
    NotesDataManager
};