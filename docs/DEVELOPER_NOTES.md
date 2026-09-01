# Developer Notes

This file is for project maintenance and contributor workflow notes, not normal end-user setup.

## Build Workflow

- TypeScript source files live in `src/`.
- The browser-facing app still loads generated plain `.js` files from `app/`.
- Run `powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1` to rebuild the generated browser-facing `.js` files.
- Run `bash scripts/build.sh` on Linux or in Vercel. The hosted build uses this script before publishing `app/`.
- The project vendors TypeScript under `tools\typescript` because `npm` is not assumed to exist in this environment.
- Deployment behavior and the browser data boundary are described in [HOSTING.md](./HOSTING.md).

## Documentation Hygiene

- When a commit changes visible behavior, setup, workflow, or UX, update the in-app changelog and README in the same slice of work if needed.
- Keep feature and fix commits small enough that the matching documentation updates stay obvious.

## Ongoing Idea Capture

- When we brainstorm or agree on future features, follow-up ideas, or direction changes, add them to [TODO.md](./TODO.md) before they evaporate into chat history.

## Useful Local Tools

- `.\scripts\Analyze-Backup.ps1 summary "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json"`
- `.\scripts\Analyze-Backup.ps1 find "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" "file_id" -MaxMatches 10`
- `.\scripts\Analyze-Backup.ps1 image-refs "C:\Users\apoli\Desktop\ChatGPT Backup\conversations.json" -MaxMatches 20`
- `.\scripts\Analyze-Backup.ps1 extract-json "C:\Users\apoli\Desktop\ChatGPT Backup\chat.html"`
