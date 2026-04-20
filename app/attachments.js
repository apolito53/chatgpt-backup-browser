"use strict";
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const { state } = window.ChatBrowser.stateModule;
    let cachedImagesReference = null;
    let cachedImageLookup = new Map();
    let cachedImageById = new Map();
    const IMAGE_REFERENCE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i;
    const IMAGE_REFERENCE_PATH_HINT_PATTERN = /(file-service:\/\/|sediment:\/\/|sandbox:\/mnt\/data\/|\/backend-api\/files\/|dalle-generations\/|conversations\/)/i;
    const IMAGE_REFERENCE_ID_PATTERN = /(file_[a-z0-9]+|file-[a-z0-9-]+)/i;
    function getMessageAttachmentKey(message) {
        return `${message.conversationId || "conversation"}::${message.id || "message"}`;
    }
    function stripQueryAndFragment(value) {
        return String(value).split(/[?#]/, 1)[0];
    }
    function basenameForPath(value) {
        const normalized = stripQueryAndFragment(value).replace(/\\/g, "/");
        if (!normalized) {
            return "";
        }
        const segments = normalized.split("/").filter(Boolean);
        return segments.length ? segments[segments.length - 1] : normalized;
    }
    function normalizeCandidate(candidate) {
        return String(candidate).toLowerCase().trim();
    }
    function looksLikeImageReferenceString(value) {
        const normalized = normalizeCandidate(value);
        if (!normalized) {
            return false;
        }
        const stripped = stripQueryAndFragment(normalized);
        return (IMAGE_REFERENCE_ID_PATTERN.test(stripped)
            || IMAGE_REFERENCE_EXTENSION_PATTERN.test(stripped)
            || IMAGE_REFERENCE_PATH_HINT_PATTERN.test(stripped));
    }
    function collectImageReferenceCandidates(value, found = []) {
        if (!value) {
            return found;
        }
        if (typeof value === "string") {
            if (looksLikeImageReferenceString(value) && !found.includes(value)) {
                found.push(value);
            }
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
    function extractPointerKey(candidate) {
        const normalized = normalizeCandidate(candidate);
        if (!normalized) {
            return "";
        }
        const pointerMatch = normalized.match(IMAGE_REFERENCE_ID_PATTERN);
        if (pointerMatch) {
            return pointerMatch[1];
        }
        return "";
    }
    function buildReferenceLookupKeys(value) {
        const normalized = normalizeCandidate(value);
        if (!normalized) {
            return [];
        }
        const stripped = stripQueryAndFragment(normalized);
        const basename = basenameForPath(stripped).toLowerCase();
        const pointerKey = extractPointerKey(stripped);
        const keys = new Set();
        if (stripped) {
            keys.add(stripped);
        }
        if (basename) {
            keys.add(basename);
        }
        if (pointerKey) {
            keys.add(pointerKey);
        }
        return Array.from(keys);
    }
    function findMatchingImageIds(candidate, imageLookup) {
        const normalized = normalizeCandidate(candidate);
        if (!normalized) {
            return [];
        }
        const stripped = stripQueryAndFragment(normalized);
        const basename = basenameForPath(stripped).toLowerCase();
        const pointerKey = extractPointerKey(stripped);
        if (pointerKey) {
            const pointerMatches = imageLookup.get(pointerKey) || [];
            if (pointerMatches.length) {
                return pointerMatches.slice();
            }
        }
        const canUseExactString = Boolean(stripped
            && stripped !== basename
            && (IMAGE_REFERENCE_PATH_HINT_PATTERN.test(stripped)
                || IMAGE_REFERENCE_ID_PATTERN.test(stripped)));
        if (canUseExactString) {
            const exactMatches = imageLookup.get(stripped) || [];
            if (exactMatches.length) {
                return exactMatches.slice();
            }
        }
        if (basename) {
            const basenameMatches = imageLookup.get(basename) || [];
            if (basenameMatches.length === 1) {
                return basenameMatches.slice();
            }
        }
        return [];
    }
    function matchesImageCandidate(image, candidate) {
        const normalized = normalizeCandidate(candidate);
        if (!normalized) {
            return false;
        }
        const stripped = stripQueryAndFragment(normalized);
        const path = image.relativePath.toLowerCase();
        const name = image.name.toLowerCase();
        const basename = basenameForPath(stripped).toLowerCase();
        const pointerKey = extractPointerKey(stripped);
        const canUseExactString = Boolean(stripped
            && stripped !== basename
            && (IMAGE_REFERENCE_PATH_HINT_PATTERN.test(stripped)
                || IMAGE_REFERENCE_ID_PATTERN.test(stripped)));
        return (Boolean(pointerKey && (path.includes(pointerKey) || name.includes(pointerKey)))
            || (canUseExactString && (stripped === path || stripped === name)));
    }
    function buildImageLookup(images) {
        const lookup = new Map();
        for (const image of images) {
            const keys = new Set();
            for (const value of [image.name, image.relativePath]) {
                for (const key of buildReferenceLookupKeys(value)) {
                    keys.add(key);
                }
            }
            for (const key of keys) {
                const existing = lookup.get(key) || [];
                if (!existing.includes(image.id)) {
                    existing.push(image.id);
                    lookup.set(key, existing);
                }
            }
        }
        return lookup;
    }
    function getImageLookupContext() {
        const images = state.index?.images || [];
        if (cachedImagesReference !== images) {
            cachedImagesReference = images;
            cachedImageLookup = buildImageLookup(images);
            cachedImageById = new Map(images.map((image) => [image.id, image]));
        }
        return {
            images,
            imageLookup: cachedImageLookup,
            imageById: cachedImageById,
        };
    }
    function clearMessagePayload(message) {
        delete message.rawContent;
        delete message.rawMetadata;
        delete message.contentType;
    }
    function resolveMessageImages(message) {
        if (!state.index?.images?.length) {
            return [];
        }
        const attachmentKey = getMessageAttachmentKey(message);
        if (state.messageAssetMap instanceof Map && state.messageAssetMap.has(attachmentKey)) {
            const storedAttachments = state.messageAssetMap.get(attachmentKey) || [];
            const { imageById } = getImageLookupContext();
            return storedAttachments
                .map((attachment) => ({
                image: imageById.get(attachment.imageId),
                reference: attachment.reference,
            }))
                .filter((attachment) => Boolean(attachment.image));
        }
        const references = [];
        if (message.rawContent) {
            references.push({ source: "content", value: message.rawContent });
        }
        if (message.rawMetadata) {
            references.push({ source: "metadata", value: message.rawMetadata });
        }
        if (!references.length) {
            if (state.messageAssetMap instanceof Map) {
                state.messageAssetMap.set(attachmentKey, []);
            }
            clearMessagePayload(message);
            return [];
        }
        const resolved = [];
        const usedImageIds = new Set();
        const cachedAttachments = [];
        const { images, imageLookup, imageById } = getImageLookupContext();
        for (const reference of references) {
            const candidates = collectImageReferenceCandidates(reference.value, []);
            for (const candidate of candidates) {
                const matchingIds = findMatchingImageIds(candidate, imageLookup);
                let image = matchingIds
                    .map((imageId) => imageById.get(imageId))
                    .find((item) => Boolean(item && !usedImageIds.has(item.id)));
                if (!image) {
                    image = images.find((item) => !usedImageIds.has(item.id) && matchesImageCandidate(item, candidate));
                }
                if (!image) {
                    continue;
                }
                usedImageIds.add(image.id);
                cachedAttachments.push({
                    imageId: image.id,
                    candidate,
                    referenceSource: reference.source,
                    reference: reference.value,
                });
                resolved.push({
                    image,
                    reference: reference.value,
                });
            }
        }
        if (state.messageAssetMap instanceof Map) {
            state.messageAssetMap.set(attachmentKey, cachedAttachments);
        }
        clearMessagePayload(message);
        return resolved;
    }
    function buildMessageAssetMap(conversations, images) {
        if (!images.length) {
            return new Map();
        }
        const imageLookup = buildImageLookup(images);
        const imageById = new Map(images.map((image) => [image.id, image]));
        const map = new Map();
        for (const conversation of conversations) {
            for (const message of conversation.messages) {
                const references = [];
                if (message.rawContent) {
                    references.push({ source: "content", value: message.rawContent });
                }
                if (message.rawMetadata) {
                    references.push({ source: "metadata", value: message.rawMetadata });
                }
                if (!references.length) {
                    continue;
                }
                const resolved = [];
                const usedImageIds = new Set();
                for (const reference of references) {
                    const candidates = collectImageReferenceCandidates(reference.value, []);
                    for (const candidate of candidates) {
                        const matchingIds = findMatchingImageIds(candidate, imageLookup);
                        let image = matchingIds
                            .map((imageId) => imageById.get(imageId))
                            .find((item) => Boolean(item && !usedImageIds.has(item.id)));
                        if (!image) {
                            image = images.find((item) => !usedImageIds.has(item.id) && matchesImageCandidate(item, candidate));
                        }
                        if (!image) {
                            continue;
                        }
                        usedImageIds.add(image.id);
                        resolved.push({
                            imageId: image.id,
                            candidate,
                            referenceSource: reference.source,
                            reference: reference.value,
                        });
                    }
                }
                if (resolved.length) {
                    map.set(getMessageAttachmentKey(message), resolved);
                }
            }
        }
        return map;
    }
    async function buildMessageAssetMapIncremental(conversations, images, options = {}) {
        if (!images.length) {
            options.onProgress?.({ processedMessages: 0, totalMessages: 0, progress: 100 });
            return new Map();
        }
        const totalMessages = conversations.reduce((sum, conversation) => sum + (Array.isArray(conversation.messages) ? conversation.messages.length : 0), 0);
        if (!totalMessages) {
            options.onProgress?.({ processedMessages: 0, totalMessages: 0, progress: 100 });
            return new Map();
        }
        const imageLookup = buildImageLookup(images);
        const imageById = new Map(images.map((image) => [image.id, image]));
        const map = new Map();
        const chunkSize = Math.max(10, Number(options.chunkSize) || 200);
        let processedMessages = 0;
        for (const conversation of conversations) {
            for (const message of conversation.messages) {
                const references = [];
                if (message.rawContent) {
                    references.push({ source: "content", value: message.rawContent });
                }
                if (message.rawMetadata) {
                    references.push({ source: "metadata", value: message.rawMetadata });
                }
                if (references.length) {
                    const resolved = [];
                    const usedImageIds = new Set();
                    for (const reference of references) {
                        const candidates = collectImageReferenceCandidates(reference.value, []);
                        for (const candidate of candidates) {
                            const matchingIds = findMatchingImageIds(candidate, imageLookup);
                            let image = matchingIds
                                .map((imageId) => imageById.get(imageId))
                                .find((item) => Boolean(item && !usedImageIds.has(item.id)));
                            if (!image) {
                                image = images.find((item) => !usedImageIds.has(item.id) && matchesImageCandidate(item, candidate));
                            }
                            if (!image) {
                                continue;
                            }
                            usedImageIds.add(image.id);
                            resolved.push({
                                imageId: image.id,
                                candidate,
                                referenceSource: reference.source,
                                reference: reference.value,
                            });
                        }
                    }
                    if (resolved.length) {
                        map.set(getMessageAttachmentKey(message), resolved);
                    }
                }
                processedMessages += 1;
                if (processedMessages % chunkSize === 0) {
                    options.onProgress?.({
                        processedMessages,
                        totalMessages,
                        progress: Math.min(100, Math.round((processedMessages / totalMessages) * 100)),
                    });
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        }
        options.onProgress?.({ processedMessages, totalMessages, progress: 100 });
        return map;
    }
    window.ChatBrowser.attachments = {
        getMessageAttachmentKey,
        collectImageReferenceCandidates,
        hasStructuredMessageContent,
        extractPointerKey,
        buildMessageAssetMap,
        buildMessageAssetMapIncremental,
        resolveMessageImages,
    };
})();
