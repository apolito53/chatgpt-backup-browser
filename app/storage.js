"use strict";
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const { STORAGE_KEY, ARCHIVE_DB_NAME, ARCHIVE_DB_VERSION, ARCHIVE_SESSION_STORE, state, } = window.ChatBrowser.stateModule;
    let archiveDbPromise = null;
    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.addEventListener("success", () => resolve(request.result));
            request.addEventListener("error", () => reject(request.error));
        });
    }
    function transactionToPromise(transaction) {
        return new Promise((resolve, reject) => {
            transaction.addEventListener("complete", () => resolve());
            transaction.addEventListener("abort", () => reject(transaction.error));
            transaction.addEventListener("error", () => reject(transaction.error));
        });
    }
    function openArchiveDatabase() {
        if (!("indexedDB" in window)) {
            return Promise.resolve(null);
        }
        if (!archiveDbPromise) {
            archiveDbPromise = new Promise((resolve, reject) => {
                const request = window.indexedDB.open(ARCHIVE_DB_NAME, ARCHIVE_DB_VERSION);
                request.addEventListener("upgradeneeded", () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains(ARCHIVE_SESSION_STORE)) {
                        database.createObjectStore(ARCHIVE_SESSION_STORE, { keyPath: "key" });
                    }
                });
                request.addEventListener("success", () => resolve(request.result));
                request.addEventListener("error", () => reject(request.error));
            }).catch((error) => {
                console.warn("Failed to open archive database:", error);
                archiveDbPromise = null;
                return null;
            });
        }
        return archiveDbPromise;
    }
    function buildFileFingerprint(file) {
        return [file.name || "unknown", file.size || 0, file.lastModified || 0].join(":");
    }
    function buildSessionKey({ sourceMode, sourceName, fingerprint }) {
        return [sourceMode, sourceName || "unknown", fingerprint || "none"].join("::");
    }
    function serializeMessageAssetMap(map) {
        return Array.from(map.entries());
    }
    function deserializeMessageAssetMap(entries) {
        if (!Array.isArray(entries)) {
            return new Map();
        }
        return new Map(entries);
    }
    function serializeConversationsForStorage(conversations) {
        return (conversations || []).map((conversation) => ({
            ...conversation,
            messages: (conversation.messages || []).map((message) => {
                const { rawContent, rawMetadata, contentType, ...safeMessage } = message || {};
                return safeMessage;
            }),
        }));
    }
    function normalizeStats(index) {
        const conversations = Array.isArray(index?.conversations) ? index.conversations : [];
        const images = Array.isArray(index?.images) ? index.images : [];
        const messageCount = conversations.reduce((sum, conversation) => sum + (Number.isFinite(conversation.messageCount) ? conversation.messageCount : 0), 0);
        return {
            conversations: conversations.length,
            messages: messageCount,
            images: images.length,
        };
    }
    function normalizeIndex(index) {
        if (!index || typeof index !== "object") {
            return null;
        }
        const conversations = Array.isArray(index.conversations) ? index.conversations : [];
        const images = Array.isArray(index.images) ? index.images : [];
        return {
            ...index,
            conversations,
            images,
            stats: index.stats && typeof index.stats === "object"
                ? {
                    conversations: Number.isFinite(index.stats.conversations) ? index.stats.conversations : conversations.length,
                    messages: Number.isFinite(index.stats.messages) ? index.stats.messages : normalizeStats({ conversations, images }).messages,
                    images: Number.isFinite(index.stats.images) ? index.stats.images : images.length,
                }
                : normalizeStats({ conversations, images }),
            rawConversationMap: index.rawConversationMap instanceof Map ? index.rawConversationMap : new Map(),
            messageAssetMap: index.messageAssetMap instanceof Map ? index.messageAssetMap : new Map(),
        };
    }
    function serializeIndexForStorage(index) {
        return {
            ...index,
            conversations: serializeConversationsForStorage(index.conversations),
            images: (index.images || []).map(({ objectUrl, ...image }) => ({
                ...image,
                objectUrl: null,
            })),
            rawConversationMap: undefined,
            messageAssetMap: serializeMessageAssetMap(index.messageAssetMap instanceof Map ? index.messageAssetMap : new Map()),
        };
    }
    function deserializeStoredIndex(record) {
        if (!record?.index) {
            return null;
        }
        return normalizeIndex({
            ...record.index,
            images: (record.index.images || []).map((image) => ({
                ...image,
                objectUrl: image.objectUrl || null,
            })),
            rawConversationMap: new Map(record.rawConversationEntries || []),
            messageAssetMap: deserializeMessageAssetMap(record.index.messageAssetMap),
        });
    }
    async function saveSessionRecord({ sessionKey, sourceMode, sourceLabel, index, }) {
        const database = await openArchiveDatabase();
        if (!database) {
            return;
        }
        const transaction = database.transaction(ARCHIVE_SESSION_STORE, "readwrite");
        const store = transaction.objectStore(ARCHIVE_SESSION_STORE);
        store.put({
            key: sessionKey,
            sourceMode,
            sourceLabel,
            savedAt: Date.now(),
            index: serializeIndexForStorage(index),
            rawConversationEntries: Array.from((index.rawConversationMap instanceof Map ? index.rawConversationMap : new Map()).entries()),
        });
        await transactionToPromise(transaction);
    }
    function summarizeRecord(record) {
        const index = deserializeStoredIndex(record);
        if (!index) {
            return null;
        }
        return {
            sessionKey: record.key,
            sourceMode: record.sourceMode || "file",
            sourceLabel: record.sourceLabel || index.source || "cached session",
            savedAt: Number.isFinite(record.savedAt) ? record.savedAt : 0,
            stats: normalizeStats(index),
        };
    }
    function sortStoredRecords(records) {
        return records
            .slice()
            .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }
    async function loadRecentSessionRecords(limit = 5) {
        const database = await openArchiveDatabase();
        if (!database) {
            return [];
        }
        const transaction = database.transaction(ARCHIVE_SESSION_STORE, "readonly");
        const store = transaction.objectStore(ARCHIVE_SESSION_STORE);
        const records = await requestToPromise(store.getAll());
        await transactionToPromise(transaction);
        return sortStoredRecords(records)
            .map(summarizeRecord)
            .filter(Boolean)
            .slice(0, Math.max(0, limit));
    }
    async function loadSessionRecord(sessionKey) {
        const database = await openArchiveDatabase();
        if (!database) {
            return null;
        }
        const transaction = database.transaction(ARCHIVE_SESSION_STORE, "readonly");
        const store = transaction.objectStore(ARCHIVE_SESSION_STORE);
        const record = await requestToPromise(store.get(sessionKey));
        await transactionToPromise(transaction);
        if (!record) {
            return null;
        }
        const index = deserializeStoredIndex(record);
        if (!index) {
            return null;
        }
        return {
            sessionKey: record.key,
            sourceMode: record.sourceMode || "file",
            sourceLabel: record.sourceLabel || index.source || "cached session",
            savedAt: Number.isFinite(record.savedAt) ? record.savedAt : 0,
            index,
            stats: normalizeStats(index),
        };
    }
    async function loadLatestSessionRecord() {
        const recent = await loadRecentSessionRecords(1);
        if (!recent.length) {
            return null;
        }
        return loadSessionRecord(recent[0].sessionKey);
    }
    function saveIndex(index) {
        if (state.cacheMode !== "single-file") {
            return;
        }
        try {
            const cacheableIndex = serializeIndexForStorage(index);
            cacheableIndex.rawConversationMap = undefined;
            cacheableIndex.messageAssetMap = undefined;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheableIndex));
        }
        catch (error) {
            console.warn("Failed to save session cache:", error);
        }
    }
    function loadSavedIndex() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return null;
            }
            return normalizeIndex(JSON.parse(raw));
        }
        catch (error) {
            console.warn("Failed to restore session cache:", error);
            return null;
        }
    }
    function revokeObjectUrls() {
        for (const url of state.objectUrls) {
            URL.revokeObjectURL(url);
        }
        state.objectUrls = [];
    }
    window.ChatBrowser.storage = {
        buildFileFingerprint,
        buildSessionKey,
        normalizeIndex,
        saveSessionRecord,
        loadRecentSessionRecords,
        loadSessionRecord,
        loadLatestSessionRecord,
        saveIndex,
        loadSavedIndex,
        revokeObjectUrls,
    };
})();
