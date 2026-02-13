const vscode = require('vscode');
const https = require('https');

/**
 * Manages syncing notes data to/from a GitHub repo using the GitHub REST API.
 * No Git installation required — uses the Contents API with a Personal Access Token.
 */
class GitHubSyncManager {
    constructor(context) {
        this.context = context;
        this.fileSha = null; // SHA of the current notes.json in the repo
        this._isSyncing = false;
        this._lastSyncTime = null;
        this._onSyncStatusChanged = new vscode.EventEmitter();
        this.onSyncStatusChanged = this._onSyncStatusChanged.event;
    }

    /**
     * Check if sync is properly configured (repo URL + token)
     */
    isConfigured() {
        const config = vscode.workspace.getConfiguration('quickNotes.sync');
        const repoUrl = config.get('repoUrl', '');
        return repoUrl.length > 0;
    }

    /**
     * Parse the owner/repo from the configured repo URL
     * Supports: https://github.com/owner/repo or https://github.com/owner/repo.git
     */
    _parseRepo() {
        const config = vscode.workspace.getConfiguration('quickNotes.sync');
        const repoUrl = config.get('repoUrl', '');
        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
        if (!match) {
            throw new Error(`Invalid GitHub repo URL: ${repoUrl}`);
        }
        return {
            owner: match[1],
            repo: match[2]
        };
    }

    /**
     * Make an HTTPS request to the GitHub API
     */
    async _apiRequest(method, path, body = null) {
        const session = await vscode.authentication.getSession('github', ['repo'], {
            createIfNone: true
        });
        if (!session) {
            throw new Error('Authentication cancelled');
        }
        const token = session.accessToken;

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: path,
                method: method,
                headers: {
                    'User-Agent': 'QuickNotes-VSCode-Extension',
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${token}`
                }
            };

            if (body) {
                options.headers['Content-Type'] = 'application/json';
            }

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve({
                                status: res.statusCode,
                                data: JSON.parse(data)
                            });
                        } catch {
                            resolve({
                                status: res.statusCode,
                                data: data
                            });
                        }
                    } else if (res.statusCode === 404) {
                        resolve({
                            status: 404,
                            data: null
                        });
                    } else {
                        let errorMsg = `GitHub API error ${res.statusCode}`;
                        try {
                            const parsed = JSON.parse(data);
                            errorMsg += `: ${parsed.message || ''}`;
                        } catch {
                            /* ignore parse error */
                        }
                        reject(new Error(errorMsg));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Network error: ${err.message}`));
            });

            // Set a 30-second timeout
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    /**
     * Pull the latest notes.json from the GitHub repo.
     * Returns the parsed data object, or null if the file doesn't exist yet.
     */
    async pull() {
        if (!this.isConfigured()) {
            return null;
        }

        try {
            const {
                owner,
                repo
            } = this._parseRepo();
            const result = await this._apiRequest(
                'GET',
                `/repos/${owner}/${repo}/contents/notes.json`
            );

            if (result.status === 404) {
                // File doesn't exist yet in the repo — first sync
                this.fileSha = null;
                return null;
            }

            // Store the SHA for updates
            this.fileSha = result.data.sha;

            // Decode base64 content
            const content = Buffer.from(result.data.content, 'base64').toString('utf8');
            return JSON.parse(content);
        } catch (err) {
            console.error('GitHubSync pull failed:', err.message);
            throw err;
        }
    }

    /**
     * Push notes data to the GitHub repo.
     * Creates or updates notes.json in the repo.
     */
    async push(data) {
        if (!this.isConfigured()) {
            return;
        }

        if (this._isSyncing) {
            return; // Skip if already syncing
        }

        this._isSyncing = true;
        this._onSyncStatusChanged.fire('syncing');

        try {
            const {
                owner,
                repo
            } = this._parseRepo();
            const content = Buffer.from(
                JSON.stringify(data, null, 2)
            ).toString('base64');

            const body = {
                message: `Sync notes — ${new Date().toISOString()}`,
                content: content
            };

            // If we have a SHA, this is an update; otherwise it's a create
            if (this.fileSha) {
                body.sha = this.fileSha;
            }

            const result = await this._apiRequest(
                'PUT',
                `/repos/${owner}/${repo}/contents/notes.json`,
                body
            );

            // Update SHA for next operation
            this.fileSha = result.data.content.sha;
            this._lastSyncTime = new Date();
            this._onSyncStatusChanged.fire('synced');
        } catch (err) {
            this._onSyncStatusChanged.fire('error');
            // Check for conflict (409) which means SHA is out of date
            if (err.message.includes('409')) {
                err.isConflict = true;
            }
            console.error('GitHubSync push failed:', err.message);
            throw err;
        } finally {
            this._isSyncing = false;
        }
    }

    /**
     * Merge local and remote data, preferring the newer version of each note.
     * Projects and notes are merged by ID. Archive is also merged.
     */
    mergeData(localData, remoteData) {
        if (!remoteData) return localData;
        if (!localData) return remoteData;

        const merged = {
            version: localData.version || remoteData.version || '1.0.0',
            projects: {},
            archivedProjects: {}
        };

        // Merge active projects
        const allProjectIds = new Set([
            ...Object.keys(localData.projects || {}),
            ...Object.keys(remoteData.projects || {})
        ]);

        for (const projectId of allProjectIds) {
            const localProject = localData.projects?. [projectId];
            const remoteProject = remoteData.projects?. [projectId];

            if (localProject && remoteProject) {
                // Both exist — merge notes
                merged.projects[projectId] = {
                    ...remoteProject,
                    ...localProject,
                    notes: this._mergeNotes(
                        localProject.notes || [],
                        remoteProject.notes || []
                    )
                };
            } else {
                // Only one exists — take whichever
                merged.projects[projectId] = localProject || remoteProject;
            }
        }

        // Merge archived projects
        const allArchivedIds = new Set([
            ...Object.keys(localData.archivedProjects || {}),
            ...Object.keys(remoteData.archivedProjects || {})
        ]);

        for (const projectId of allArchivedIds) {
            const localArchived = localData.archivedProjects?. [projectId];
            const remoteArchived = remoteData.archivedProjects?. [projectId];

            if (localArchived && remoteArchived) {
                merged.archivedProjects[projectId] = {
                    ...remoteArchived,
                    ...localArchived,
                    notes: this._mergeNotes(
                        localArchived.notes || [],
                        remoteArchived.notes || []
                    )
                };
            } else {
                merged.archivedProjects[projectId] = localArchived || remoteArchived;
            }
        }

        return merged;
    }

    /**
     * Merge two arrays of notes by ID. For duplicates, keep the one with newer updatedAt.
     */
    _mergeNotes(localNotes, remoteNotes) {
        const noteMap = new Map();

        // Add remote notes first
        for (const note of remoteNotes) {
            noteMap.set(note.id, note);
        }

        // Override with local if newer
        for (const note of localNotes) {
            const existing = noteMap.get(note.id);
            if (!existing) {
                noteMap.set(note.id, note);
            } else {
                const localTime = new Date(note.updatedAt || note.createdAt).getTime();
                const remoteTime = new Date(existing.updatedAt || existing.createdAt).getTime();
                if (localTime >= remoteTime) {
                    noteMap.set(note.id, note);
                }
            }
        }

        return Array.from(noteMap.values());
    }

    /**
     * Full sync: pull remote, merge with local, push result, return merged data.
     * Retries once on 409 conflict.
     */
    async sync(localData) {
        try {
            const remoteData = await this.pull();
            const merged = this.mergeData(localData, remoteData);
            await this.push(merged);
            return merged;
        } catch (err) {
            if (err.isConflict) {
                // Retry once: pull again to get new SHA and content, then merge and push
                const remoteData = await this.pull();
                const merged = this.mergeData(localData, remoteData);
                await this.push(merged);
                return merged;
            }
            throw err;
        }
    }

    get lastSyncTime() {
        return this._lastSyncTime;
    }

    get isSyncing() {
        return this._isSyncing;
    }
}

module.exports = {
    GitHubSyncManager
};