# ChatGPT Backup Browser

This is a tiny local browser app for exploring a ChatGPT backup without loading the raw export into a normal tab and hoping for the best.

## What it does

- Loads either a single export file or the whole backup folder
- Extracts the embedded `jsonData` archive when using HTML, or reads the JSON directly
- Builds a searchable conversation index
- Indexes image files from the full backup folder
- Persists a lightweight archive catalog in IndexedDB so the parsed backup structure can be restored without reparsing
- Resolves message-to-image attachment mappings lazily and caches them after first use
- Lets you lazy-load full raw JSON and attachment metadata for an individual conversation when you need to inspect it more closely
- Shows inline conversation images using explicit backup attachment references instead of broad fuzzy matching
- Includes a small in-app changelog modal so the tool can show versioned changes without taking over the UI
- Lets you filter by role (`user`, `assistant`, `system`)
- Lets you filter conversations by model when the export includes `model_slug` or `default_model_slug`
- Sorts by update time, create time, title, or message count
- Shows a clean reading view for the currently selected conversation
- Includes an image gallery plus preview panel when you load the folder
- Stays lightweight while moving toward TypeScript without dragging in a full frontend toolchain

## How to use it

1. Open [index.html](./index.html) in a browser.
2. Use **Load One File** if you only want `chat.html` or `conversations.json`.
3. Use **Load Entire Backup Folder** if you want conversations and images together.
4. Wait for parsing to finish.
5. Switch between **Conversations** and **Images** as needed.

## TypeScript Workflow

- TypeScript source files live in `src/`.
- The browser still loads plain `.js` files from the project root.
- Run `powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1` to compile the migrated `.ts` files back into those browser-facing `.js` files.
- The project vendors a local TypeScript compiler under `tools\typescript` because this environment does not have `npm` available.
- The build script also creates a local `tools\node-runtime\node.exe` copy when Windows blocks the packaged `node.exe` inside `WindowsApps`.

## Maintenance Notes

- When a commit changes app behavior, workflow, setup, UX, or visible capabilities, update the in-app changelog and the README in the same slice of work if needed.
- When we brainstorm or agree on future features, follow-up ideas, or direction changes, capture them in `TODO.md` before they wander off into chat history.
- Keep feature/fix commits intentional and small enough that the matching changelog and documentation updates are obvious.

The first migration batch covers the shared foundation files:

- `src/changelog.ts`
- `src/state.ts`
- `src/ui.ts`
- `src/render.ts`

## Notes

- The app runs fully on your machine.
- It runs fully in the browser with no dependencies or local server required.
- The last parsed single-file session is cached in browser storage so you can reload the tool without choosing the file again.
- The app also keeps a lightweight IndexedDB catalog of the parsed archive structure, raw conversation records, and attachment mappings.
- Restored folder sessions can bring back the indexed metadata after refresh, but image previews still need the folder to be selected again because browsers do not persist the live file objects for you.
- Conversations restored from cache can fetch their full raw JSON and attachment metadata later if the original file or folder is still re-selected in the browser.
- It reads the currently selected conversation branch from each exported conversation, which is usually what you want.
- Project ideas and planned features live in [TODO.md](./TODO.md).

## Analysis Helper

There is also a PowerShell helper for inspecting huge export files without relying on fragile ad hoc searches:

- `.\Analyze-Backup.ps1 summary "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json"`
- `.\Analyze-Backup.ps1 find "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" "file_id" -MaxMatches 10`
- `.\Analyze-Backup.ps1 image-refs "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" -MaxMatches 20`
- `.\Analyze-Backup.ps1 extract-json "C:\Users\apoli\Desktop\ChatGPT Backup\chat.html"`

Use `extract-json` when you want the embedded `jsonData` payload pulled out of `chat.html` into a standalone JSON file for easier inspection.
