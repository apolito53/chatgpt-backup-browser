// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

window.ChatBrowser.changelog = {
  APP_VERSION: "0.5.2",
  CHANGELOG_ENTRIES: [
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
