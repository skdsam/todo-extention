---
description: Rebuild the VSIX extension package
---
// turbo-all

1. Increment the version number in `package.json` if significant changes were made.
2. Run the packaging command:
   ```powershell
   npm run package
   ```
3. Remove old `.vsix` files to keep the workspace clean.
   ```powershell
   Get-ChildItem *.vsix | Where-Object { $_.Name -ne (Get-Content package.json | ConvertFrom-Json).name + "-" + (Get-Content package.json | ConvertFrom-Json).version + ".vsix" } | Remove-Item
   ```
