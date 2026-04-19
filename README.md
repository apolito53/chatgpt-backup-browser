# ChatGPT Backup Browser

This is a tiny local browser app for exploring a ChatGPT backup without loading the raw export into a normal tab and hoping for the best.

## What it does

- Loads either a single export file or the whole backup folder
- Extracts the embedded `jsonData` archive when using HTML, or reads the JSON directly
- Builds a searchable conversation index
- Indexes image files from the full backup folder
- Lets you filter by role (`user`, `assistant`, `system`)
- Sorts by update time, create time, title, or message count
- Shows a clean reading view for the currently selected conversation
- Includes an image gallery plus preview panel when you load the folder

## How to use it

1. Open [index.html](./index.html) in a browser.
2. Use **Load One File** if you only want `chat.html` or `conversations.json`.
3. Use **Load Entire Backup Folder** if you want conversations and images together.
4. Wait for parsing to finish.
5. Switch between **Conversations** and **Images** as needed.

## Notes

- The app is dependency-free and runs fully on your machine.
- It runs fully in the browser with no dependencies or local server required.
- The last parsed single-file session is cached in browser storage so you can reload the tool without choosing the file again.
- Full folder sessions include live file handles for images, so those stay in the current tab session only.
- It reads the currently selected conversation branch from each exported conversation, which is usually what you want.

## Analysis Helper

There is also a PowerShell helper for inspecting huge export files without relying on fragile ad hoc searches:

- `.\Analyze-Backup.ps1 summary "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json"`
- `.\Analyze-Backup.ps1 find "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" "file_id" -MaxMatches 10`
- `.\Analyze-Backup.ps1 image-refs "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" -MaxMatches 20`
- `.\Analyze-Backup.ps1 extract-json "C:\Users\apoli\Desktop\ChatGPT Backup\chat.html"`

Use `extract-json` when you want the embedded `jsonData` payload pulled out of `chat.html` into a standalone JSON file for easier inspection.
