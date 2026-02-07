const vscode = require('vscode');

/**
 * Integration with the project-tracker extension
 * Reads project data from the existing project-tracker extension
 */
class ProjectTracker {
    constructor() {
        this.cachedProjects = [];
    }

    /**
     * Get projects from project-tracker extension
     * Falls back to workspace folders if project-tracker is not available
     */
    async getProjects() {
        try {
            // Try to get projects from project-tracker extension's globalState
            const projects = await this.getProjectTrackerProjects();
            
            if (projects && projects.length > 0) {
                this.cachedProjects = projects;
                return projects;
            }
        } catch (error) {
            console.log('Project-tracker integration error:', error.message);
        }

        // Fallback: use currently open workspace folders
        return this.getWorkspaceFolders();
    }

    /**
     * Try to read from project-tracker extension's data
     */
    async getProjectTrackerProjects() {
        // First, try to execute the project-tracker command to get projects
        try {
            // The project-tracker extension stores data in globalState
            // We'll try a few approaches to get the data
            
            // Approach 1: Try to find the extension and access its exports
            const projectTrackerExt = vscode.extensions.getExtension('skdsam.project-tracker');
            
            if (projectTrackerExt) {
                // Wait for activation if needed
                if (!projectTrackerExt.isActive) {
                    await projectTrackerExt.activate();
                }
                
                // Check if the extension exports a way to get projects
                const exports = projectTrackerExt.exports;
                
                if (exports && exports.getProjects) {
                    return await exports.getProjects();
                }
                
                if (exports && exports.projects) {
                    return exports.projects;
                }
            }
        } catch (error) {
            console.log('Could not access project-tracker exports:', error.message);
        }

        // Approach 2: Use the MCP server if available
        try {
            // Check if we can list projects via MCP
            const mcpProjects = await this.tryMCPProjectList();
            if (mcpProjects && mcpProjects.length > 0) {
                return mcpProjects;
            }
        } catch (error) {
            console.log('MCP project list not available:', error.message);
        }

        // Approach 3: Check VS Code's recently opened workspace storage
        return this.getRecentWorkspaces();
    }

    /**
     * Try to get projects via MCP server
     * This might not work directly in extension context but worth trying
     */
    async tryMCPProjectList() {
        // MCP isn't directly accessible from extension code 
        // This is a placeholder for potential future integration
        return null;
    }

    /**
     * Get VS Code's recent workspaces as fallback
     */
    async getRecentWorkspaces() {
        try {
            // Get recently opened workspaces from VS Code
            const recentlyOpened = await vscode.commands.executeCommand('_workbench.getRecentlyOpened');
            
            if (recentlyOpened && recentlyOpened.workspaces) {
                return recentlyOpened.workspaces
                    .filter(w => w.folderUri || (w.workspace && w.workspace.configPath))
                    .slice(0, 20) // Limit to 20 recent projects
                    .map(w => {
                        const uri = w.folderUri || w.workspace?.configPath;
                        const path = uri.fsPath || uri.path;
                        const name = path.split(/[/\\]/).pop();
                        
                        return {
                            name,
                            path,
                            icon: 'folder',
                            color: null,
                            lastAccessed: new Date().toISOString()
                        };
                    });
            }
        } catch (error) {
            console.log('Could not get recent workspaces:', error.message);
        }
        
        return [];
    }

    /**
     * Get current workspace folders as last resort fallback
     */
    getWorkspaceFolders() {
        const folders = vscode.workspace.workspaceFolders || [];
        
        return folders.map(folder => ({
            name: folder.name,
            path: folder.uri.fsPath,
            icon: 'folder',
            color: null,
            lastAccessed: new Date().toISOString()
        }));
    }

    /**
     * Check if project-tracker extension is installed
     */
    isProjectTrackerInstalled() {
        return vscode.extensions.getExtension('skdsam.project-tracker') !== undefined;
    }
}

module.exports = { ProjectTracker };
