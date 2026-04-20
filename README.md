# ChatGPT Backup Browser

ChatGPT Backup Browser is a small local tool for exploring a ChatGPT export without dumping a giant backup file into a normal browser tab and praying.

It is meant to be simple to run, easy to browse, and useful for reading old conversations, inspecting metadata, and digging through attached images from a full backup folder.

## Highlights

- Open either `chat.html`, `conversations.json`, or an entire backup folder
- Choose between a clearly explained `Robust` or `Lightweight` digest method for folder imports
- Browse conversations and move through them with in-app pagination and browser back/forward history
- Search, sort, and filter by role or model
- Browse backup images and show matching images inline inside conversations
- Keep the image preview panel in view while browsing long image lists
- Switch between backups with clearer in-app confirmation wording when another archive is already open
- Inspect raw conversation JSON on demand when something looks odd
- Restore cached sessions without reparsing the whole archive every time
- See which model produced assistant turns when the export includes that metadata, without internal tool chatter cluttering the reader
- Check a small in-app changelog instead of wondering what changed this time

## Getting Started

1. Open [index.html](./index.html) in a browser.
2. Pick **Load One File** if you only care about `chat.html` or `conversations.json`.
3. Pick **Load Entire Backup Folder** if you want conversations and images together.
4. Choose `Lightweight` or `Robust` mode for folder imports.
5. Browse conversations, inspect images, and load raw JSON for specific conversations when needed.

## Import Modes

- `Load One File` is best when you only need the conversation archive.
- `Load Entire Backup Folder` is best when you want images and file-backed attachments too.
- `Lightweight` mode keeps parsing leaner for huge exports.
- `Robust` mode keeps more metadata available and is the better default when your browser can handle it.

## Notes

- The app runs fully on your machine in the browser.
- It does not need a backend or database server.
- Single-file sessions can be restored from browser storage after refresh.
- Folder sessions can restore cached metadata, but live image previews still require re-selecting the original folder because browsers do not persist those file handles for ordinary pages.
- The viewer reads the selected conversation branch from the export, which is usually the branch you actually care about.

## Project Roadmap

Planned features and longer-term ideas live in [TODO.md](./TODO.md).

## For Contributors

Contributor workflow notes live in [DEVELOPER_NOTES.md](./DEVELOPER_NOTES.md).

There is also a PowerShell helper for inspecting large exports if you are working on parser or archive tooling changes:

- `.\Analyze-Backup.ps1 summary "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json"`
- `.\Analyze-Backup.ps1 find "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" "file_id" -MaxMatches 10`
- `.\Analyze-Backup.ps1 image-refs "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" -MaxMatches 20`
- `.\Analyze-Backup.ps1 extract-json "C:\Users\apoli\Desktop\ChatGPT Backup\chat.html"`
