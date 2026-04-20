// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

window.ChatBrowser.changelog = {
  APP_VERSION: "0.5.13",
  CHANGELOG_ENTRIES: [
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
