"use strict";
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    function extractLeadingJsonValue(sourceText) {
        const startIndex = sourceText.search(/[\[{]/);
        if (startIndex === -1) {
            throw new Error("Could not find JSON data in the selected export.");
        }
        const openingChar = sourceText[startIndex];
        const closingChar = openingChar === "[" ? "]" : "}";
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = startIndex; index < sourceText.length; index += 1) {
            const character = sourceText[index];
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (character === "\\") {
                    escaped = true;
                    continue;
                }
                if (character === "\"") {
                    inString = false;
                }
                continue;
            }
            if (character === "\"") {
                inString = true;
                continue;
            }
            if (character === openingChar) {
                depth += 1;
                continue;
            }
            if (character === closingChar) {
                depth -= 1;
                if (depth === 0) {
                    return sourceText.slice(startIndex, index + 1).trim();
                }
            }
        }
        throw new Error("The export file looks incomplete. Could not isolate its JSON payload.");
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
        return extractLeadingJsonValue(htmlText.slice(dataStart, scriptEnd));
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
    function buildConversationIndex(rawData, options = {}) {
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
                options.onProgress?.(`Summarizing conversations... ${index.toLocaleString()} / ${rawData.length.toLocaleString()}`, progress);
            }
        }
        return {
            conversations,
            totalMessages,
            rawConversationEntries,
            rawConversationEntriesOmitted: rawData.length > maxRawConversationEntries,
        };
    }
    window.ChatBrowser.parserShared = {
        extractConversationArray,
        coerceTextParts,
        collectImageReferenceCandidates,
        hasStructuredMessageContent,
        normalizeModelSlug,
        getConversationModelInfo,
        getMessageModelInfo,
        isVisibleMessage,
        lineageForConversation,
        summarizeConversation,
        summarizeConversationLightweight,
        buildConversationIndex,
    };
})();
