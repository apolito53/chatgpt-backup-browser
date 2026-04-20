// @ts-check

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
    const { conversations, totalMessages, rawConversationEntries } = buildConversationIndex(rawData);

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

function isVisibleMessage(message) {
  if (!message) {
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
