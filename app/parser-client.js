// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const { IMAGE_EXTENSIONS, state, elements } = window.ChatBrowser.stateModule;
const { setStatus, setProgress } = window.ChatBrowser.ui;

const pendingConversationDetailLoads = new Map();
let conversationDetailSessionKey = null;

function postLocalProgress(status, progress) {
  setStatus(status);
  setProgress(progress, false);
}

function extractJsonPayload(htmlText) {
  const marker = "var jsonData = ";
  const start = htmlText.indexOf(marker);
  if (start === -1) {
    throw new Error("Could not find the embedded jsonData payload in the selected file.");
  }

  const dataStart = start + marker.length;
  const scriptEnd = htmlText.indexOf("</script>", dataStart);
  if (scriptEnd === -1) {
    throw new Error("The export file looks incomplete. Missing closing <script> tag.");
  }

  let payload = htmlText.slice(dataStart, scriptEnd).trim();
  if (payload.endsWith(";")) {
    payload = payload.slice(0, -1).trim();
  }

  return payload;
}

function extractConversationArray(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("The selected file is empty.");
  }

  if (trimmed.startsWith("[")) {
    return trimmed;
  }

  if (trimmed.includes("var jsonData = ")) {
    return extractJsonPayload(trimmed);
  }

  throw new Error("Unsupported export format. Choose chat.html or conversations.json.");
}

function getSelectedConversationSourceFile() {
  if (elements.fileInput.files?.length) {
    return elements.fileInput.files[0];
  }

  if (elements.folderInput.files?.length) {
    return Array.from(elements.folderInput.files).find(
      (file) => (file.webkitRelativePath || file.name).endsWith("conversations.json"),
    ) || Array.from(elements.folderInput.files).find(
      (file) => (file.webkitRelativePath || file.name).endsWith("chat.html"),
    ) || null;
  }

  return null;
}

function canLoadConversationDetails(conversationId) {
  return Boolean(
    conversationId
    && (
      state.rawConversationMap.has(conversationId)
      || getSelectedConversationSourceFile()
    ),
  );
}

function resetConversationDetailLoadStateIfNeeded() {
  if (conversationDetailSessionKey === state.currentSessionKey) {
    return;
  }

  conversationDetailSessionKey = state.currentSessionKey;
  pendingConversationDetailLoads.clear();
}

function coerceTextParts(content) {
  if (!content) {
    return "";
  }

  if (Array.isArray(content.parts)) {
    return content.parts
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          if (typeof part.text === "string") {
            return part.text;
          }
          if (typeof part.caption === "string") {
            return part.caption;
          }
          if (typeof part.alt === "string") {
            return part.alt;
          }
          if (typeof part.title === "string") {
            return part.title;
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (typeof content.text === "string") {
    return content.text;
  }

  if (typeof content.result === "string") {
    return content.result;
  }

  if (typeof content === "string") {
    return content;
  }

  return "";
}

function collectImageReferenceCandidates(value, found = []) {
  if (!value) {
    return found;
  }

  if (typeof value === "string") {
    found.push(value);
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageReferenceCandidates(item, found);
    }
    return found;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectImageReferenceCandidates(nested, found);
    }
  }

  return found;
}

function hasStructuredMessageContent(message) {
  if (!message) {
    return false;
  }

  const contentCandidates = collectImageReferenceCandidates(message.content, []);
  const metadataCandidates = collectImageReferenceCandidates(message.metadata, []);
  return contentCandidates.length > 0 || metadataCandidates.length > 0;
}

function normalizeModelSlug(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getConversationModelInfo(conversation) {
  const metadata = conversation?.metadata && typeof conversation.metadata === "object" ? conversation.metadata : {};
  const candidates = [
    conversation?.model_slug,
    conversation?.default_model_slug,
    metadata.model_slug,
    metadata.default_model_slug,
  ];
  const normalized = candidates.map(normalizeModelSlug).filter(Boolean);

  return {
    modelSlug: normalized[0] || "",
    defaultModelSlug: normalized[1] || "",
  };
}

function getMessageModelInfo(message, conversationModelInfo) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const candidates = [
    metadata.resolved_model_slug,
    metadata.model_slug,
    metadata.default_model_slug,
    conversationModelInfo?.modelSlug,
    conversationModelInfo?.defaultModelSlug,
  ];
  const normalized = candidates.map(normalizeModelSlug).filter(Boolean);

  return {
    speakerModelSlug: normalized[0] || "",
    speakerDefaultModelSlug: normalized[1] || "",
  };
}

function isVisibleMessage(message) {
  if (!message) {
    return false;
  }

  const role = message.author?.role || "";
  if (role === "tool") {
    return false;
  }

  const metadata = message.metadata || {};
  if (metadata.is_visually_hidden_from_conversation || metadata.is_user_system_message) {
    return false;
  }

  const text = coerceTextParts(message.content).trim();
  return Boolean(text) || hasStructuredMessageContent(message);
}

function lineageForConversation(conversation) {
  const mapping = conversation.mapping || {};
  const visited = new Set();
  const orderedIds = [];
  let currentId = conversation.current_node;

  while (currentId && mapping[currentId] && !visited.has(currentId)) {
    visited.add(currentId);
    orderedIds.push(currentId);
    currentId = mapping[currentId].parent;
  }

  orderedIds.reverse();
  return orderedIds;
}

function summarizeConversation(conversation, index) {
  const orderedIds = lineageForConversation(conversation);
  const conversationId = conversation.conversation_id || conversation.id || `conversation-${index}`;
  const messages = [];
  const conversationModelInfo = getConversationModelInfo(conversation);
  const { modelSlug, defaultModelSlug } = conversationModelInfo;

  for (const id of orderedIds) {
    const node = conversation.mapping?.[id];
    const message = node?.message;
    if (!isVisibleMessage(message)) {
      continue;
    }

    const text = coerceTextParts(message.content).trim();
    if (!text && !hasStructuredMessageContent(message)) {
      continue;
    }

    const { speakerModelSlug, speakerDefaultModelSlug } = getMessageModelInfo(message, conversationModelInfo);

    messages.push({
      id: message.id || id,
      conversationId,
      role: message.author?.role || "unknown",
      authorName: message.author?.name || null,
      speakerModelSlug,
      speakerDefaultModelSlug,
      createTime: message.create_time || null,
      updateTime: message.update_time || null,
      text,
      rawContent: message.content || null,
      rawMetadata: message.metadata || null,
      contentType: message.content?.content_type || "unknown",
    });
  }

  const title = (conversation.title || "").trim() || "Untitled conversation";
  const previewSource = messages.find((message) => message.role !== "system") || messages[0];
  const preview = previewSource
    ? previewSource.text.replace(/\s+/g, " ").slice(0, 180)
    : "No visible message content in the selected branch.";

  const searchBlob = `${title}\n${modelSlug}\n${defaultModelSlug}\n${messages.map((message) => `${message.role}\n${message.text}`).join("\n")}`.toLowerCase();

  return {
    id: conversationId,
    title,
    createdAt: conversation.create_time || null,
    updatedAt: conversation.update_time || null,
    modelSlug,
    defaultModelSlug,
    preview,
    messageCount: messages.length,
    messages,
    searchBlob,
  };
}

async function loadConversationDetails(conversationId) {
  if (!conversationId) {
    return null;
  }

  const cachedRawConversation = state.rawConversationMap.get(conversationId);
  if (cachedRawConversation) {
    return {
      rawConversation: cachedRawConversation,
      conversation: summarizeConversation(cachedRawConversation, 0),
    };
  }

  resetConversationDetailLoadStateIfNeeded();
  if (pendingConversationDetailLoads.has(conversationId)) {
    return pendingConversationDetailLoads.get(conversationId);
  }

  const pendingLoad = (async () => {
    const sourceFile = getSelectedConversationSourceFile();
    if (!sourceFile) {
      return null;
    }

    const rawText = await sourceFile.text();
    const payload = extractConversationArray(rawText);
    const rawData = JSON.parse(payload);
    if (!Array.isArray(rawData)) {
      throw new Error("Expected the export to contain a conversation array.");
    }

    const rawConversation = rawData.find((conversation) => {
      const rawConversationId = conversation?.conversation_id || conversation?.id || "";
      return rawConversationId === conversationId;
    }) || null;

    if (!rawConversation) {
      return null;
    }

    state.rawConversationMap.set(conversationId, rawConversation);
    return {
      rawConversation,
      conversation: summarizeConversation(rawConversation, 0),
    };
  })();

  pendingConversationDetailLoads.set(conversationId, pendingLoad);

  try {
    return await pendingLoad;
  } finally {
    pendingConversationDetailLoads.delete(conversationId);
  }
}

function summarizeConversationLightweight(conversation, index) {
  const orderedIds = lineageForConversation(conversation);
  const conversationId = conversation.conversation_id || conversation.id || `conversation-${index}`;
  const messages = [];
  const conversationModelInfo = getConversationModelInfo(conversation);

  for (const id of orderedIds) {
    const node = conversation.mapping?.[id];
    const message = node?.message;
    if (!message) {
      continue;
    }

    const metadata = message.metadata || {};
    if (metadata.is_visually_hidden_from_conversation || metadata.is_user_system_message) {
      continue;
    }

    const text = coerceTextParts(message.content).trim();
    if (!text) {
      continue;
    }

    const { speakerModelSlug, speakerDefaultModelSlug } = getMessageModelInfo(message, conversationModelInfo);

    messages.push({
      id: message.id || id,
      conversationId,
      role: message.author?.role || "unknown",
      authorName: message.author?.name || null,
      speakerModelSlug,
      speakerDefaultModelSlug,
      createTime: message.create_time || null,
      updateTime: message.update_time || null,
      text,
    });
  }

  const title = (conversation.title || "").trim() || "Untitled conversation";
  const previewSource = messages.find((message) => message.role !== "system") || messages[0];
  const preview = previewSource
    ? previewSource.text.replace(/\s+/g, " ").slice(0, 180)
    : "No visible text message content in lightweight mode.";

  const searchBlob = `${title}\n${messages.map((message) => `${message.role}\n${message.text}`).join("\n")}`.toLowerCase();

  return {
    id: conversationId,
    title,
    createdAt: conversation.create_time || null,
    updatedAt: conversation.update_time || null,
    preview,
    messageCount: messages.length,
    messages,
    searchBlob,
  };
}

async function parseConversationsLightweight(rawText) {
  postLocalProgress("Extracting conversation payload...", 10);
  const payload = extractConversationArray(rawText);

  postLocalProgress("Parsing conversation JSON...", 30);
  const rawData = JSON.parse(payload);
  if (!Array.isArray(rawData)) {
    throw new Error("Expected the export to contain a conversation array.");
  }

  postLocalProgress("Summarizing conversations in lightweight mode...", 45);
  const conversations = [];
  const rawConversationEntries = [];
  const maxRawConversationEntries = 150;
  let totalMessages = 0;

  for (let index = 0; index < rawData.length; index += 1) {
    const conversation = rawData[index];
    const summary = summarizeConversationLightweight(conversation, index);
    conversations.push(summary);
    totalMessages += summary.messageCount;

    if (index > 0 && index % 25 === 0) {
      const progress = Math.min(95, 45 + Math.round((index / rawData.length) * 50));
      postLocalProgress(
        `Summarizing conversations in lightweight mode... ${index.toLocaleString()} / ${rawData.length.toLocaleString()}`,
        progress,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    conversations,
    totalMessages,
    rawConversationMap: new Map(),
    rawConversationEntriesOmitted: true,
  };
}

function parserWorkerBootstrap() {
  self.addEventListener("message", (event) => {
    const { type, rawText } = event.data || {};
    if (type !== "parse-conversations" || typeof rawText !== "string") {
      return;
    }

    try {
      postProgress("Extracting conversation payload...", 10);
      const payload = extractConversationArray(rawText);

      postProgress("Parsing conversation JSON...", 30);
      const rawData = JSON.parse(payload);
      if (!Array.isArray(rawData)) {
        throw new Error("Expected the export to contain a conversation array.");
      }

      postProgress("Summarizing conversations...", 45);
      const { conversations, totalMessages, rawConversationEntries, rawConversationEntriesOmitted } = buildConversationIndex(rawData);

      self.postMessage({
        type: "parse-complete",
        conversations,
        totalMessages,
        rawConversationEntries,
        rawConversationEntriesOmitted,
      });
    } catch (error) {
      self.postMessage({
        type: "parse-error",
        message: error instanceof Error ? error.message : "Failed to parse export.",
      });
    }
  });

  function postProgress(status, progress) {
    self.postMessage({ type: "parse-progress", status, progress });
  }

  function extractJsonPayload(htmlText) {
    const marker = "var jsonData = ";
    const start = htmlText.indexOf(marker);
    if (start === -1) {
      throw new Error("Could not find the embedded jsonData payload in the selected file.");
    }

    const dataStart = start + marker.length;
    const scriptEnd = htmlText.indexOf("</script>", dataStart);
    if (scriptEnd === -1) {
      throw new Error("The export file looks incomplete. Missing closing <script> tag.");
    }

    let payload = htmlText.slice(dataStart, scriptEnd).trim();
    if (payload.endsWith(";")) {
      payload = payload.slice(0, -1).trim();
    }

    return payload;
  }

  function extractConversationArray(rawText) {
    const trimmed = rawText.trim();
    if (!trimmed) {
      throw new Error("The selected file is empty.");
    }

    if (trimmed.startsWith("[")) {
      return trimmed;
    }

    if (trimmed.includes("var jsonData = ")) {
      return extractJsonPayload(trimmed);
    }

    throw new Error("Unsupported export format. Choose chat.html or conversations.json.");
  }

  function coerceTextParts(content) {
    if (!content) {
      return "";
    }

    if (Array.isArray(content.parts)) {
      return content.parts
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object") {
            if (typeof part.text === "string") {
              return part.text;
            }
            if (typeof part.caption === "string") {
              return part.caption;
            }
            if (typeof part.alt === "string") {
              return part.alt;
            }
            if (typeof part.title === "string") {
              return part.title;
            }
            return "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n\n");
    }

    if (typeof content.text === "string") {
      return content.text;
    }

    if (typeof content.result === "string") {
      return content.result;
    }

    if (typeof content === "string") {
      return content;
    }

    return "";
  }

  function collectImageReferenceCandidates(value, found = []) {
    if (!value) {
      return found;
    }

    if (typeof value === "string") {
      found.push(value);
      return found;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectImageReferenceCandidates(item, found);
      }
      return found;
    }

    if (typeof value === "object") {
      for (const nested of Object.values(value)) {
        collectImageReferenceCandidates(nested, found);
      }
    }

    return found;
  }

  function hasStructuredMessageContent(message) {
    if (!message) {
      return false;
    }

    const contentCandidates = collectImageReferenceCandidates(message.content, []);
    const metadataCandidates = collectImageReferenceCandidates(message.metadata, []);
    return contentCandidates.length > 0 || metadataCandidates.length > 0;
  }

  function normalizeModelSlug(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getConversationModelInfo(conversation) {
    const metadata = conversation?.metadata && typeof conversation.metadata === "object" ? conversation.metadata : {};
    const candidates = [
      conversation?.model_slug,
      conversation?.default_model_slug,
      metadata.model_slug,
      metadata.default_model_slug,
    ];
    const normalized = candidates.map(normalizeModelSlug).filter(Boolean);

    return {
      modelSlug: normalized[0] || "",
      defaultModelSlug: normalized[1] || "",
    };
  }

function isVisibleMessage(message) {
  if (!message) {
    return false;
  }

  const role = message.author?.role || "";
  if (role === "tool") {
    return false;
  }

  const metadata = message.metadata || {};
  if (metadata.is_visually_hidden_from_conversation || metadata.is_user_system_message) {
    return false;
  }

    const text = coerceTextParts(message.content).trim();
    return Boolean(text) || hasStructuredMessageContent(message);
  }

  function lineageForConversation(conversation) {
    const mapping = conversation.mapping || {};
    const visited = new Set();
    const orderedIds = [];
    let currentId = conversation.current_node;

    while (currentId && mapping[currentId] && !visited.has(currentId)) {
      visited.add(currentId);
      orderedIds.push(currentId);
      currentId = mapping[currentId].parent;
    }

    orderedIds.reverse();
    return orderedIds;
  }

  function summarizeConversation(conversation, index) {
    const orderedIds = lineageForConversation(conversation);
    const conversationId = conversation.conversation_id || conversation.id || `conversation-${index}`;
    const messages = [];
    const { modelSlug, defaultModelSlug } = getConversationModelInfo(conversation);

    for (const id of orderedIds) {
      const node = conversation.mapping?.[id];
      const message = node?.message;
      if (!isVisibleMessage(message)) {
        continue;
      }

      const text = coerceTextParts(message.content).trim();
      if (!text && !hasStructuredMessageContent(message)) {
        continue;
      }

      messages.push({
        id: message.id || id,
        conversationId,
        role: message.author?.role || "unknown",
        authorName: message.author?.name || null,
        createTime: message.create_time || null,
        updateTime: message.update_time || null,
        text,
        rawContent: message.content || null,
        rawMetadata: message.metadata || null,
        contentType: message.content?.content_type || "unknown",
      });
    }

    const title = (conversation.title || "").trim() || "Untitled conversation";
    const previewSource = messages.find((message) => message.role !== "system") || messages[0];
    const preview = previewSource
      ? previewSource.text.replace(/\s+/g, " ").slice(0, 180)
      : "No visible message content in the selected branch.";

    const searchBlob = `${title}\n${modelSlug}\n${defaultModelSlug}\n${messages.map((message) => `${message.role}\n${message.text}`).join("\n")}`.toLowerCase();

    return {
      id: conversationId,
      title,
      createdAt: conversation.create_time || null,
      updatedAt: conversation.update_time || null,
      modelSlug,
      defaultModelSlug,
      preview,
      messageCount: messages.length,
      messages,
      searchBlob,
    };
  }

  function buildConversationIndex(rawData) {
    const conversations = [];
    const rawConversationEntries = [];
    const maxRawConversationEntries = 150;
    let totalMessages = 0;

    for (let index = 0; index < rawData.length; index += 1) {
      const conversation = rawData[index];
      const summary = summarizeConversation(conversation, index);
      conversations.push(summary);
      totalMessages += summary.messageCount;
      if (rawConversationEntries.length < maxRawConversationEntries) {
        rawConversationEntries.push([summary.id, conversation]);
      }

      if (index > 0 && index % 200 === 0) {
        const progress = Math.min(95, 45 + Math.round((index / rawData.length) * 50));
        postProgress(
          `Summarizing conversations... ${index.toLocaleString()} / ${rawData.length.toLocaleString()}`,
          progress,
        );
      }
    }

    return {
      conversations,
      totalMessages,
      rawConversationEntries,
      rawConversationEntriesOmitted: rawData.length > maxRawConversationEntries,
    };
  }
}

function createParserWorker() {
  if (window.location.protocol === "file:") {
    const workerSource = `(${parserWorkerBootstrap.toString()})();`;
    const blob = new Blob([workerSource], { type: "text/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    const worker = new Worker(objectUrl);
    return {
      worker,
      cleanupUrl() {
        URL.revokeObjectURL(objectUrl);
      },
    };
  }

  return {
    worker: new Worker("./conversation-parser-worker.js"),
    cleanupUrl() {},
  };
}

function parseConversationsInWorker(rawText) {
  if (state.parserMode === "lightweight") {
    return parseConversationsLightweight(rawText);
  }

  return new Promise((resolve, reject) => {
    const { worker, cleanupUrl } = createParserWorker();

    const cleanup = () => {
      worker.terminate();
      cleanupUrl();
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
          rawConversationEntriesOmitted: Boolean(message.rawConversationEntriesOmitted),
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
    // Robust mode now resolves attachments lazily for the active conversation
    // so large archives can finish loading without a full eager precompute pass.
    messageAssetMap: new Map(),
  };
}

window.ChatBrowser.parserClient = {
  parseConversationsInWorker,
  buildImagesIndex,
  buildBackupIndex,
  canLoadConversationDetails,
  loadConversationDetails,
};
})();
