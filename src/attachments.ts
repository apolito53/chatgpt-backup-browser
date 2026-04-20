(() => {
  window.ChatBrowser = window.ChatBrowser || {};

  const { state } = window.ChatBrowser.stateModule!;

  let cachedImagesReference: ImageRecord[] | null = null;
  let cachedImageLookup = new Map<string, string[]>();
  let cachedImageById = new Map<string, ImageRecord>();
  const IMAGE_REFERENCE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i;
  const IMAGE_REFERENCE_PATH_HINT_PATTERN = /(file-service:\/\/|sediment:\/\/|sandbox:\/mnt\/data\/|\/backend-api\/files\/|dalle-generations\/|conversations\/)/i;
  const IMAGE_REFERENCE_ID_PATTERN = /(file_[a-z0-9]+|file-[a-z0-9-]+)/i;

  function getMessageAttachmentKey(message: MessageRecord): string {
    return `${message.conversationId || "conversation"}::${message.id || "message"}`;
  }

  function stripQueryAndFragment(value: unknown): string {
    return String(value).split(/[?#]/, 1)[0];
  }

  function basenameForPath(value: string): string {
    const normalized = stripQueryAndFragment(value).replace(/\\/g, "/");
    if (!normalized) {
      return "";
    }

    const segments = normalized.split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1] : normalized;
  }

  function normalizeCandidate(candidate: unknown): string {
    return String(candidate).toLowerCase().trim();
  }

  function looksLikeImageReferenceString(value: unknown): boolean {
    const normalized = normalizeCandidate(value);
    if (!normalized) {
      return false;
    }

    const stripped = stripQueryAndFragment(normalized);
    return (
      IMAGE_REFERENCE_ID_PATTERN.test(stripped)
      || IMAGE_REFERENCE_EXTENSION_PATTERN.test(stripped)
      || IMAGE_REFERENCE_PATH_HINT_PATTERN.test(stripped)
    );
  }

  function collectImageReferenceCandidates(value: unknown, found: string[] = []): string[] {
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

  function hasStructuredMessageContent(message: any): boolean {
    if (!message) {
      return false;
    }

    const contentCandidates = collectImageReferenceCandidates(message.content, []);
    const metadataCandidates = collectImageReferenceCandidates(message.metadata, []);
    return contentCandidates.length > 0 || metadataCandidates.length > 0;
  }

  function extractPointerKey(candidate: unknown): string {
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

  function buildReferenceLookupKeys(value: unknown): string[] {
    const normalized = normalizeCandidate(value);
    if (!normalized) {
      return [];
    }

    const stripped = stripQueryAndFragment(normalized);
    const basename = basenameForPath(stripped).toLowerCase();
    const pointerKey = extractPointerKey(stripped);
    const keys = new Set<string>();

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

  function findMatchingImageIds(candidate: unknown, imageLookup: Map<string, string[]>): string[] {
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

    const canUseExactString = Boolean(
      stripped
      && stripped !== basename
      && (
        IMAGE_REFERENCE_PATH_HINT_PATTERN.test(stripped)
        || IMAGE_REFERENCE_ID_PATTERN.test(stripped)
      ),
    );

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

  function matchesImageCandidate(image: ImageRecord, candidate: unknown): boolean {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) {
      return false;
    }

    const stripped = stripQueryAndFragment(normalized);
    const path = image.relativePath.toLowerCase();
    const name = image.name.toLowerCase();
    const basename = basenameForPath(stripped).toLowerCase();
    const pointerKey = extractPointerKey(stripped);
    const canUseExactString = Boolean(
      stripped
      && stripped !== basename
      && (
        IMAGE_REFERENCE_PATH_HINT_PATTERN.test(stripped)
        || IMAGE_REFERENCE_ID_PATTERN.test(stripped)
      ),
    );

    return (
      Boolean(pointerKey && (path.includes(pointerKey) || name.includes(pointerKey)))
      || (canUseExactString && (stripped === path || stripped === name))
    );
  }

  function buildImageLookup(images: ImageRecord[]): Map<string, string[]> {
    const lookup = new Map<string, string[]>();

    for (const image of images) {
      const keys = new Set<string>();

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

  function getImageLookupContext(): {
    images: ImageRecord[];
    imageLookup: Map<string, string[]>;
    imageById: Map<string, ImageRecord>;
  } {
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

  function clearMessagePayload(message: MessageRecord): void {
    delete message.rawContent;
    delete message.rawMetadata;
    delete message.contentType;
  }

  function resolveMessageImages(message: MessageRecord): MessageImageResolution[] {
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
        .filter((attachment): attachment is MessageImageResolution => Boolean(attachment.image));
    }

    const references: Array<{ source: string; value: unknown }> = [];

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

    const resolved: MessageImageResolution[] = [];
    const usedImageIds = new Set<string>();
    const cachedAttachments: MessageAttachmentRecord[] = [];
    const { images, imageLookup, imageById } = getImageLookupContext();

    for (const reference of references) {
      const candidates = collectImageReferenceCandidates(reference.value, []);
      for (const candidate of candidates) {
        const matchingIds = findMatchingImageIds(candidate, imageLookup);
        let image = matchingIds
          .map((imageId) => imageById.get(imageId))
          .find((item): item is ImageRecord => Boolean(item && !usedImageIds.has(item.id)));

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

  function buildMessageAssetMap(conversations: ConversationRecord[], images: ImageRecord[]): Map<string, MessageAttachmentRecord[]> {
    if (!images.length) {
      return new Map();
    }

    const imageLookup = buildImageLookup(images);
    const imageById = new Map(images.map((image) => [image.id, image]));
    const map = new Map<string, MessageAttachmentRecord[]>();

    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        const references: Array<{ source: string; value: unknown }> = [];
        if (message.rawContent) {
          references.push({ source: "content", value: message.rawContent });
        }
        if (message.rawMetadata) {
          references.push({ source: "metadata", value: message.rawMetadata });
        }

        if (!references.length) {
          continue;
        }

        const resolved: MessageAttachmentRecord[] = [];
        const usedImageIds = new Set<string>();

        for (const reference of references) {
          const candidates = collectImageReferenceCandidates(reference.value, []);
          for (const candidate of candidates) {
            const matchingIds = findMatchingImageIds(candidate, imageLookup);
            let image = matchingIds
              .map((imageId) => imageById.get(imageId))
              .find((item): item is ImageRecord => Boolean(item && !usedImageIds.has(item.id)));

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

  async function buildMessageAssetMapIncremental(
    conversations: ConversationRecord[],
    images: ImageRecord[],
    options: IncrementalAttachmentOptions = {},
  ): Promise<Map<string, MessageAttachmentRecord[]>> {
    if (!images.length) {
      options.onProgress?.({ processedMessages: 0, totalMessages: 0, progress: 100 });
      return new Map();
    }

    const totalMessages = conversations.reduce(
      (sum, conversation) => sum + (Array.isArray(conversation.messages) ? conversation.messages.length : 0),
      0,
    );

    if (!totalMessages) {
      options.onProgress?.({ processedMessages: 0, totalMessages: 0, progress: 100 });
      return new Map();
    }

    const imageLookup = buildImageLookup(images);
    const imageById = new Map(images.map((image) => [image.id, image]));
    const map = new Map<string, MessageAttachmentRecord[]>();
    const chunkSize = Math.max(10, Number(options.chunkSize) || 200);
    let processedMessages = 0;

    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        const references: Array<{ source: string; value: unknown }> = [];
        if (message.rawContent) {
          references.push({ source: "content", value: message.rawContent });
        }
        if (message.rawMetadata) {
          references.push({ source: "metadata", value: message.rawMetadata });
        }

        if (references.length) {
          const resolved: MessageAttachmentRecord[] = [];
          const usedImageIds = new Set<string>();

          for (const reference of references) {
            const candidates = collectImageReferenceCandidates(reference.value, []);
            for (const candidate of candidates) {
              const matchingIds = findMatchingImageIds(candidate, imageLookup);
              let image = matchingIds
                .map((imageId) => imageById.get(imageId))
                .find((item): item is ImageRecord => Boolean(item && !usedImageIds.has(item.id)));

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
