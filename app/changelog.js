"use strict";
// @ts-check
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    window.ChatBrowser.changelog = {
        APP_VERSION: "0.5.51",
        CHANGELOG_ENTRIES: [
            {
                version: "0.5.51",
                date: "April 21, 2026",
                changes: [
                    "Stopped showing cached folder archives in browsers that cannot reopen them, so Firefox no longer advertises a dead-end restore button.",
                    "Kept recent archive restore entries for sources the current browser can actually reopen.",
                ],
            },
            {
                version: "0.5.50",
                date: "April 21, 2026",
                changes: [
                    "Made raw-detail loading use saved folder access when available without dropping into the full folder picker.",
                    "Kept manual folder selection as a fallback only when no saved handle exists for that cached archive.",
                ],
            },
            {
                version: "0.5.49",
                date: "April 21, 2026",
                changes: [
                    "Fixed Load Full Conversation Details so it can reconnect a saved folder handle on demand before reading raw JSON.",
                    "Hid the raw JSON dropdown until raw conversation data is actually loaded.",
                ],
            },
            {
                version: "0.5.48",
                date: "April 21, 2026",
                changes: [
                    "Kept the browser page URL synced to the active archive session so browser Back returns with context intact.",
                    "Made browser-page popstate restore the requested session instead of falling back to a stale or empty archive view.",
                ],
            },
            {
                version: "0.5.47",
                date: "April 21, 2026",
                changes: [
                    "Fixed conversation-page restores so opened chats carry their archive session key in the URL.",
                    "Made the reader load the exact referenced cached archive before falling back to the latest saved session.",
                ],
            },
            {
                version: "0.5.46",
                date: "April 21, 2026",
                changes: [
                    "Changed the Whole backup folder versus Chat file source picker from two large tabs into a compact dropdown.",
                    "Kept the existing folder/file import panels synced to the new selector so the splash pane gets more breathing room.",
                ],
            },
            {
                version: "0.5.45",
                date: "April 21, 2026",
                changes: [
                    "Moved the Digest method explanation out of the splash layout and into a compact hover/focus tooltip.",
                    "Trimmed the launcher pane so the importer feels less crowded while keeping the robust versus lightweight guidance nearby.",
                ],
            },
            {
                version: "0.5.44",
                date: "April 20, 2026",
                changes: [
                    "Finished hardening the conversation reader startup path by making the browser-only folder reconnect banner optional there too.",
                    "Guarded the reader against missing reconnect controls so opening conversation.html no longer dies before archived data can restore.",
                ],
            },
            {
                version: "0.5.43",
                date: "April 20, 2026",
                changes: [
                    "Rolled back the speculative reader handoff experiments after they turned out not to be the real problem.",
                    "Fixed the actual conversation-page startup bug by making browser-only image reconnect elements optional on conversation.html, so the reader can boot and restore archive data normally.",
                ],
            },
            {
                version: "0.5.37",
                date: "April 20, 2026",
                changes: [
                    "Added a minimize button for the sticky archive controls so the search and filter panel can collapse out of the conversation list's way.",
                    "Made the browser remember whether that control panel was collapsed, so refreshes stop reopening it like nothing happened.",
                ],
            },
            {
                version: "0.5.36",
                date: "April 20, 2026",
                changes: [
                    "Hardened chat.html parsing so the browser now extracts just the embedded JSON payload instead of choking on extra script content after it.",
                    "Fixed a single-file import bug where some chat.html exports were accidentally being treated like malformed JSON.",
                ],
            },
            {
                version: "0.5.35",
                date: "April 20, 2026",
                changes: [
                    "Brought the browser splash screen back as a proper top launcher and removed the old left sidebar from the main browser page.",
                    "Moved the importer, recent archives, status line, and welcome copy into the main browser canvas so the first-load experience feels intentional again.",
                    "Kept the backup stats card on the browser page, but hid it until an archive is actually loaded so the splash stays clean.",
                ],
            },
            {
                version: "0.5.34",
                date: "April 20, 2026",
                changes: [
                    "Stopped unsupported browsers from auto-restoring cached folder indexes on startup, since those sessions are not truly usable there without selecting the backup folder again.",
                    "Kept folder sessions in the recent archives list for reference, but marked them as re-select flows instead of pretending they can be reopened from cache alone.",
                ],
            },
            {
                version: "0.5.33",
                date: "April 20, 2026",
                changes: [
                    "Added a Firefox-specific folder-access note in the sidebar so the reconnect area now tells the truth about manual folder selection still being required there.",
                    "Kept the generic manual-reattach note for other browsers without directory-handle support instead of leaving the reconnect slot mysteriously blank.",
                ],
            },
            {
                version: "0.5.32",
                date: "April 20, 2026",
                changes: [
                    "Added a local robust parsing fallback when the conversation parser worker crashes, so the browser can keep loading large exports instead of dying on the spot.",
                    "Surfaced the fallback state in progress messaging so it is obvious when the app switched away from the worker and is still actively chewing through the archive.",
                ],
            },
            {
                version: "0.5.31",
                date: "April 20, 2026",
                changes: [
                    "Stopped same-archive folder reconnects from re-running the full conversation digest in robust mode when all the app really needed was to reattach live previews.",
                    "Added an in-page status banner so parser crashes, permission failures, and reconnect problems are visible in the main workspace instead of hiding in the sidebar status line.",
                ],
            },
            {
                version: "0.5.30",
                date: "April 20, 2026",
                changes: [
                    "Redesigned the main archive browser so the search, view toggle, filters, result count, and pagination sit in a tighter top layout instead of sprawling down the page.",
                    "Slimmed the restored-folder warning into a less shouty inline reconnect banner that keeps the action visible without eating half the viewport.",
                    "Restyled the browser controls into grouped cards and tighter pager bars so the conversation explorer feels intentional instead of vaguely assembled under pressure.",
                ],
            },
            {
                version: "0.5.29",
                date: "April 20, 2026",
                changes: [
                    "Added browser-native saved folder access using directory handles where supported, so reconnecting a known backup can happen from a button click instead of browsing all over again.",
                    "Stored the active folder handle separately from the archive index and reused it for reattach flows, lightweight image hydration, and lazy detail loading after reconnect.",
                    "Kept the classic folder picker in place as a fallback for browsers that do not support the newer directory access API.",
                ],
            },
            {
                version: "0.5.28",
                date: "April 20, 2026",
                changes: [
                    "Stopped same-session folder reattachments from showing the backup-switch confirmation when the selected folder matches the archive already open.",
                    "Changed lightweight folder mode so image previews are skipped on the first pass and only attached when you explicitly open Images and approve the extra attachment step.",
                    "Kept the Images tab available for folder sessions in lightweight mode so the app can warn before building previews instead of silently hiding the path forward.",
                ],
            },
            {
                version: "0.5.27",
                date: "April 20, 2026",
                changes: [
                    "Added explicit Reattach Backup Folder actions in both the conversation browser and image browser when a cached folder session restores without live file access.",
                    "Surfaced the missing-folder state as an inline banner so restored archives stop looking mysteriously broken when previews are unavailable.",
                ],
            },
            {
                version: "0.5.26",
                date: "April 20, 2026",
                changes: [
                    "Moved the backup loader controls into the browser sidebar so switching or reattaching a backup stays available even after an archive auto-restores.",
                    "Clarified the restored-folder status message so missing image previews are explained as a browser refresh limitation, not the wrong digest mode.",
                    "Synced the source tabs to the restored session type so cached folder and file sessions reopen with the right loader visible.",
                ],
            },
            {
                version: "0.5.25",
                date: "April 20, 2026",
                changes: [
                    "Fixed the browser page getting stuck in image view by adding a matching conversations/images switch inside the image browser header.",
                    "Kept the view toggle visible in both archive views so switching to images is no longer a one-way trip.",
                ],
            },
            {
                version: "0.5.24",
                date: "April 19, 2026",
                changes: [
                    "Finished the TypeScript migration for the remaining runtime modules so app behavior now comes from src/ instead of hand-maintained browser JS files.",
                    "Added a shared parser layer used by both the main thread and the worker so conversation parsing logic stops living in two places and quietly drifting apart.",
                    "Updated the browser pages to load the shared parser script explicitly before the parser client and worker runtime.",
                ],
            },
            {
                version: "0.5.23",
                date: "April 19, 2026",
                changes: [
                    "Speeded up the launcher by skipping the TypeScript rebuild on startup when the compiled browser files are already current.",
                    "Replaced the list pager's manual page number box and Go button with a page dropdown selector that jumps immediately on change.",
                ],
            },
            {
                version: "0.5.22",
                date: "April 19, 2026",
                changes: [
                    "Removed the browser page filter panel from the left sidebar so the explorer can breathe a little.",
                    "Moved search, view switching, and conversation filter controls into the top of the main browser pane above the archive list and pagination.",
                ],
            },
            {
                version: "0.5.21",
                date: "April 19, 2026",
                changes: [
                    "Reorganized the repo so the browser runtime lives under app/, docs live under docs/, and the root folder stops looking like a yard sale.",
                    "Moved the backup-analysis helper into scripts/ and tucked the older launcher wrappers into launchers/ while keeping START_BROWSER.vbs at the root.",
                    "Updated the local server and start script to serve the app from app/index.html and gently redirect older index and conversation URLs.",
                ],
            },
            {
                version: "0.5.20",
                date: "April 19, 2026",
                changes: [
                    "Renamed the quiet Explorer launcher to START_BROWSER.vbs so the obvious thing to click is finally the obvious thing to click.",
                    "Left the older launcher filenames in place as thin forwarding wrappers so existing shortcuts and habits do not immediately break.",
                ],
            },
            {
                version: "0.5.19",
                date: "April 19, 2026",
                changes: [
                    "Added a windowless VBS launcher so the app can be opened from Explorer without leaving a PowerShell or command prompt window hanging around.",
                    "Updated the existing CMD launcher to hand off immediately to the quiet launcher instead of running the startup script in the visible console window.",
                ],
            },
            {
                version: "0.5.18",
                date: "April 19, 2026",
                changes: [
                    "Added a double-click launcher file for Windows so the app can be opened from Explorer without typing a PowerShell command.",
                    "Kept the launcher pointed at the existing start script so the browser still builds, serves on localhost, and opens normally.",
                ],
            },
            {
                version: "0.5.17",
                date: "April 19, 2026",
                changes: [
                    "Moved the browser page importer into the splash state so the sidebar can stay focused on stats and filters once an archive is loaded.",
                    "Added a local start script that builds the app, serves it over localhost, and opens the browser automatically instead of relying on opening index.html directly.",
                    "Bundled a tiny static server script so the app has a cleaner launch path and fewer file:// weirdnesses.",
                ],
            },
            {
                version: "0.5.16",
                date: "April 19, 2026",
                changes: [
                    "Promoted the conversation browser into the main page content so the archive list no longer lives crammed into the sidebar.",
                    "Split reading into a dedicated conversation.html page so opening a chat feels like entering a proper reader instead of toggling an in-place detail pane.",
                    "Kept archive loading, filters, cached-session restore, and conversation navigation working across the new browser and reader pages.",
                ],
            },
            {
                version: "0.5.15",
                date: "April 19, 2026",
                changes: [
                    "Replaced the vague Use Last Loaded Session button with a real Recent archives list that shows multiple cached backups.",
                    "Let each recent archive restore itself directly instead of blindly reloading whichever session happened to be newest.",
                    "Marked the currently open archive in the recent list so the sidebar stops pretending the obvious button is useful.",
                ],
            },
            {
                version: "0.5.14",
                date: "April 19, 2026",
                changes: [
                    "Stopped tool-role messages from appearing in the conversation reader so internal tool chatter no longer clutters normal chats, including cached sessions that were parsed earlier.",
                    "Tightened assistant header labels so they prefer message-level model metadata and fall back to the conversation model before ever showing a generic assistant label.",
                ],
            },
            {
                version: "0.5.13",
                date: "April 19, 2026",
                changes: [
                    "Reworded the backup-switch modal so it reads like a temporary view change instead of something destructive or permanent.",
                    "Clarified that switching backups changes only the current tab view and does not delete the saved session cache.",
                    "Updated the modal buttons to read like plain choices instead of vague warnings.",
                ],
            },
            {
                version: "0.5.12",
                date: "April 19, 2026",
                changes: [
                    "Renamed the folder parser picker to Digest method so it reads like a user choice instead of internal jargon.",
                    "Added inline help text explaining when to choose Robust versus Lightweight mode in plain English.",
                    "Updated the option labels so the picker itself now hints at the tradeoff instead of making users guess.",
                ],
            },
            {
                version: "0.5.11",
                date: "April 19, 2026",
                changes: [
                    "Fixed the image preview panel so it stays visible while you browse long image lists instead of drifting off-screen at the top.",
                    "Made the image detail column stick in place on desktop layouts so selecting an image feels anchored to the current browsing context.",
                ],
            },
            {
                version: "0.5.10",
                date: "April 19, 2026",
                changes: [
                    "Switched assistant message headers to show the speaking model when the export includes per-message model metadata.",
                    "Pulled resolved_model_slug and related model fields through both worker and local parsing paths so hydrated conversations stay consistent.",
                    "Left a graceful fallback to the plain assistant label when older exports do not expose message-level model info.",
                ],
            },
            {
                version: "0.5.9",
                date: "April 19, 2026",
                changes: [
                    "Replaced the upload replacement browser prompt with a custom in-app confirmation modal.",
                    "Only show the replacement confirmation when a new file or folder would actually displace an archive already loaded in the viewer.",
                    "Kept the existing upload flow fast for first-time loads while giving replacement uploads a more consistent UI.",
                ],
            },
            {
                version: "0.5.8",
                date: "April 19, 2026",
                changes: [
                    "Added conversation id URL syncing so the selected chat can be reflected directly in the browser address bar.",
                    "Hooked browser back and forward navigation into conversation selection so stepping through viewed chats feels natural.",
                    "Kept URL selection recovery lightweight by restoring the requested conversation after the archive loads instead of inventing a heavier router.",
                ],
            },
            {
                version: "0.5.7",
                date: "April 19, 2026",
                changes: [
                    "Stopped unrelated images from appearing in conversations by tightening attachment reference detection to real file ids, paths, URLs, and image filenames.",
                    "Reworked attachment lookup keys so message metadata now matches images by explicit identifiers instead of broad fuzzy text guesses.",
                    "Kept lazy image hydration intact while making the resolver far less eager to hallucinate a nearby PNG.",
                ],
            },
            {
                version: "0.5.6",
                date: "April 19, 2026",
                changes: [
                    "Added a per-conversation Load Full Conversation Details action for chats that were not fully cached up front.",
                    "Lazy-loaded raw JSON and attachment metadata for later-picked conversations when the original backup source is still attached.",
                    "Kept the viewer honest by explaining when the source file or folder needs to be re-selected before full details can be loaded.",
                ],
            },
            {
                version: "0.5.5",
                date: "April 19, 2026",
                changes: [
                    "Switched robust mode back to lazy attachment resolution so large backups finish loading quickly again.",
                    "Cached attachment lookups per message after the first render instead of precomputing the entire archive at load time.",
                    "Trimmed heavy raw attachment payloads out of stored sessions so refresh caching stays lighter.",
                ],
            },
            {
                version: "0.5.4",
                date: "April 19, 2026",
                changes: [
                    "Fixed robust mode so the parser worker and the file:// fallback worker now agree on the same conversation metadata shape.",
                    "Chunked robust attachment indexing into smaller async slices so large folder loads do not lock the browser solid at the end of parsing.",
                    "Kept the full robust attachment map behavior while making the progress indicator reflect the attachment-linking phase.",
                ],
            },
            {
                version: "0.5.3",
                date: "April 19, 2026",
                changes: [
                    "Added model-aware conversation filtering so you can narrow the archive by model_slug or default_model_slug.",
                    "Surfaced the selected conversation model in the list and conversation header for faster scanning.",
                    "Made model filtering part of the saved UI state so refreshes keep the same model view.",
                ],
            },
            {
                version: "0.5.2",
                date: "April 19, 2026",
                changes: [
                    "Added an explicit Digest Selected Folder step so picking a folder no longer starts the heavy parse immediately.",
                    "Kept the digest button disabled until a folder is selected, which is a much less chaotic loading flow.",
                    "Left the parser mode toggle in place so you can still choose the lighter or more featureful path before digesting.",
                ],
            },
            {
                version: "0.5.1",
                date: "April 19, 2026",
                changes: [
                    "Split the rendering layer into dedicated conversation and image modules instead of one giant file.",
                    "Kept the no-build browser runtime intact so the app still opens directly from disk without ceremony.",
                    "Trimmed the coordinator file down so the eventual TypeScript move is less of a swamp.",
                ],
            },
            {
                version: "0.5.0",
                date: "April 19, 2026",
                changes: [
                    "Split the giant app script into focused browser-native files for state, storage, rendering, parsing, and UI behavior.",
                    "Moved the conversation parser worker into its own file instead of embedding it inside the main app script.",
                    "Added jsconfig-based type-checking hints so the codebase is ready for a cleaner TypeScript move later.",
                ],
            },
            {
                version: "0.4.0",
                date: "April 19, 2026",
                changes: [
                    "Added a compact in-app changelog with versioned release notes.",
                    "Started tracking completed work as proper feature and fix commits instead of one giant mystery blob.",
                ],
            },
            {
                version: "0.3.0",
                date: "April 19, 2026",
                changes: [
                    "Persisted parsed archive sessions in IndexedDB so the app can restore its place after a refresh.",
                    "Precomputed message-to-image attachment mappings so linked images stop being rediscovered from scratch every render.",
                ],
            },
            {
                version: "0.2.1",
                date: "April 19, 2026",
                changes: [
                    "Hardened image rendering with graceful placeholders when a cached session no longer has live file previews attached.",
                ],
            },
            {
                version: "0.2.0",
                date: "April 19, 2026",
                changes: [
                    "Added raw conversation JSON beneath the reading view so odd exported branches are easier to inspect.",
                    "Kept inline metadata available without forcing the main conversation rendering to wear the whole blob.",
                ],
            },
        ],
    };
})();
