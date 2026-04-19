// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const { IMAGE_EXTENSIONS, state } = window.ChatBrowser.stateModule;
const { setStatus, setProgress } = window.ChatBrowser.ui;
const { buildMessageAssetMap } = window.ChatBrowser.attachments;

function parseConversationsInWorker(rawText) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./conversation-parser-worker.js");

    const cleanup = () => {
      worker.terminate();
    };

    worker.addEventListener("message", (event) => {
      const message = event.data || {};

      if (message.type === "parse-progress") {
        if (typeof message.status === "string") {
          setStatus(message.status);
        }
        if (typeof message.progress === "number") {
          setProgress(message.progress, false);
        }
        return;
      }

      if (message.type === "parse-complete") {
        cleanup();
        resolve({
          conversations: Array.isArray(message.conversations) ? message.conversations : [],
          totalMessages: Number.isFinite(message.totalMessages) ? message.totalMessages : 0,
          rawConversationMap: new Map(Array.isArray(message.rawConversationEntries) ? message.rawConversationEntries : []),
        });
        return;
      }

      if (message.type === "parse-error") {
        cleanup();
        reject(new Error(message.message || "Failed to parse export."));
      }
    });

    worker.addEventListener("error", (event) => {
      cleanup();
      reject(event.error || new Error("The parser worker crashed."));
    });

    worker.postMessage({
      type: "parse-conversations",
      rawText,
    });
  });
}

function extensionForFile(file) {
  const name = file.name || "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return name.slice(dotIndex + 1).toLowerCase();
}

function buildImagesIndex(files) {
  const images = [];

  files.forEach((file, index) => {
    const extension = extensionForFile(file);
    if (!IMAGE_EXTENSIONS.has(extension)) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    state.objectUrls.push(objectUrl);

    const relativePath = file.webkitRelativePath || file.name;
    images.push({
      id: `image-${index}-${file.name}`,
      name: file.name,
      relativePath,
      size: file.size,
      lastModified: file.lastModified || 0,
      objectUrl,
      searchBlob: `${file.name}\n${relativePath}`.toLowerCase(),
    });
  });

  return images;
}

function buildBackupIndex({ conversations, images, source }) {
  const totalMessages = conversations.reduce((sum, conversation) => sum + conversation.messageCount, 0);
  return {
    loadedAt: Date.now(),
    source,
    conversations,
    images,
    stats: {
      conversations: conversations.length,
      messages: totalMessages,
      images: images.length,
    },
    messageAssetMap: buildMessageAssetMap(conversations, images),
  };
}

window.ChatBrowser.parserClient = {
  parseConversationsInWorker,
  buildImagesIndex,
  buildBackupIndex,
};
})();
