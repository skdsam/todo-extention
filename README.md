# Quick Notes 📝

A VS Code extension for jotting down ideas, TODOs, and notes tied to your projects. **Syncs automatically via VS Code Settings Sync!**

![Quick Notes Screenshot](resources/screenshot.png)

## ✨ Features

### 📂 **Project-Aware Notes**
- Automatically reads projects from your installed **project-tracker** extension
- Falls back to VS Code's recent workspaces if project-tracker isn't installed
- Each project gets its own collapsible note list

### 🎯 **Priority System**
Organize your notes by priority:
- 🔴 **High** - Urgent tasks
- 🟡 **Medium** - Normal priority
- 🟢 **Low** - Nice to have

### ⚠️ **Stale Project Detection**
- Automatically detects when a project folder no longer exists
- Visual warning indicator on stale projects
- Options to **Archive**, **Remove**, or **Update Path** for stale projects

### 🔄 **VS Code Settings Sync**
- Notes are stored in VS Code's `globalState`
- Automatically syncs across all your machines when VS Code Settings Sync is enabled
- No additional setup required!

### 📦 **Archive System**
- Archive projects with their notes preserved
- Restore archived projects at any time
- View and manage archived notes

## 🚀 Getting Started

1. Install the extension
2. Open the **Quick Notes** sidebar (notes icon in activity bar)
3. Your projects will appear automatically
4. Click the **+** button to add notes to any project

## 📋 Commands

| Command | Description |
|---------|-------------|
| `Quick Notes: Add Note` | Add a new note to a project |
| `Quick Notes: Edit Note` | Edit an existing note |
| `Quick Notes: Delete Note` | Remove a note |
| `Quick Notes: Toggle Complete` | Mark a note as done/undone |
| `Quick Notes: Set Priority` | Change note priority (High/Medium/Low) |
| `Quick Notes: Refresh Projects` | Reload the project list |
| `Quick Notes: View Archived` | See and manage archived projects |

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `quickNotes.defaultPriority` | `medium` | Default priority for new notes |
| `quickNotes.showCompletedNotes` | `true` | Show completed notes in the list |
| `quickNotes.sortBy` | `priority` | Sort order: `priority`, `createdAt`, or `alphabetical` |

## 🔗 Integration with Project Tracker

This extension integrates with the **project-tracker** extension to read your project list. If you don't have project-tracker installed, it will use:

1. VS Code's recently opened workspaces
2. Currently open workspace folders

For the best experience, install [project-tracker](https://github.com/skdsam/project-tracker) alongside this extension.

## 🗄️ Data Storage

Your notes are stored in VS Code's `globalState`, which means:
- ✅ Syncs via VS Code Settings Sync
- ✅ No external files or repos required
- ✅ Works offline
- ✅ Secure and private

## 📸 Screenshots

### Main View
Projects with their notes, priority indicators, and completion status.

### Stale Project Handling
Warning icons on projects whose folders no longer exist, with options to archive, remove, or update path.

### Priority Selection
Easy priority picker for organizing your tasks.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/skdsam/todo-extention).

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with ❤️ for productivity enthusiasts
