declare function importScripts(...urls: string[]): void;

const workerScope = globalThis as typeof globalThis & {
  ChatBrowser?: ChatBrowserNamespace;
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
};

importScripts("./parser-shared.js");

workerScope.ChatBrowser = workerScope.ChatBrowser || {};
// The worker loads parser-shared.js first in served mode.
const shared = workerScope.ChatBrowser.parserShared!;

workerScope.addEventListener("message", (event: MessageEvent) => {
  const { type, rawText } = (event.data || {}) as { type?: string; rawText?: string };
  if (type !== "parse-conversations" || typeof rawText !== "string") {
    return;
  }

  try {
    workerScope.postMessage({ type: "parse-progress", status: "Extracting conversation payload...", progress: 10 });
    const payload = shared.extractConversationArray(rawText);

    workerScope.postMessage({ type: "parse-progress", status: "Parsing conversation JSON...", progress: 30 });
    const rawData = JSON.parse(payload);
    if (!Array.isArray(rawData)) {
      throw new Error("Expected the export to contain a conversation array.");
    }

    workerScope.postMessage({ type: "parse-progress", status: "Summarizing conversations...", progress: 45 });
    const result = shared.buildConversationIndex(rawData, {
      onProgress(status: string, progress: number) {
        workerScope.postMessage({ type: "parse-progress", status, progress });
      },
    });

    workerScope.postMessage({
      type: "parse-complete",
      conversations: result.conversations,
      totalMessages: result.totalMessages,
      rawConversationEntries: result.rawConversationEntries,
      rawConversationEntriesOmitted: result.rawConversationEntriesOmitted,
    });
  } catch (error) {
    workerScope.postMessage({
      type: "parse-error",
      message: error instanceof Error ? error.message : "Failed to parse export.",
    });
  }
});
