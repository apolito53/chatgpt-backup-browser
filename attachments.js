// @ts-check

window.ChatBrowser = window.ChatBrowser || {};

const { state } = window.ChatBrowser.stateModule;

function getMessageAttachmentKey(message) {
  return `${message.conversationId || "conversation"}::${message.id || "message"}`;
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
    for (const [key, nested] of Object.entries(value)) {
      if (
        key === "asset_pointer" ||
        key === "file_id" ||
        key === "fileId" ||
        key === "id" ||
        key === "name" ||
        key === "filename" ||
        key === "url"
      ) {
        collectImageReferenceCandidates(nested, found);
      } else {
        collectImageReferenceCandidates(nested, found);
      }
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

function normalizeCandidate(candidate) {
  return String(candidate).toLowerCase().trim();
}

function extractPointerKey(candidate) {
  const normalized = normalizeCandidate(candidate);
  if (!normalized) {
    return "";
  }

  const sedimentMatch = normalized.match(/(file_[a-z0-9]+|file-[a-z0-9]+)/);
  if (sedimentMatch) {
    return sedimentMatch[1];
  }

  const serviceMatch = normalized.match(/file-service:\/\/(file-[a-z0-9]+)/);
  if (serviceMatch) {
    return serviceMatch[1];
  }

  return normalized;
}

function matchesImageCandidate(image, candidate) {
  const normalized = normalizeCandidate(candidate);
  if (!normalized) {
    return false;
  }

  const pointerKey = extractPointerKey(candidate);
  const path = image.relativePath.toLowerCase();
  const name = image.name.toLowerCase();

  return (
    (pointerKey && (path.includes(pointerKey) || name.includes(pointerKey))) ||
    path.includes(normalized) ||
    name.includes(normalized) ||
    normalized.includes(name) ||
    normalized.includes(path) ||
    path.includes(normalized.replace("file-service://", "")) ||
    path.includes(normalized.replace("sandbox:/mnt/data/", "")) ||
    name.includes(normalized.replace("sandbox:/mnt/data/", ""))
  );
}

function resolveMessageImages(message) {
  if (!state.index?.images?.length) {
    return [];
  }

  const storedAttachments = state.messageAssetMap.get(getMessageAttachmentKey(message));
  if (storedAttachments?.length) {
    const imagesById = new Map(state.index.images.map((image) => [image.id, image]));
    return storedAttachments
      .map((attachment) => ({
        image: imagesById.get(attachment.imageId),
        reference: attachment.reference,
      }))
      .filter((attachment) => attachment.image);
  }

  const references = [];

  if (message.rawContent) {
    references.push({ source: "content", value: message.rawContent });
  }

  if (message.rawMetadata) {
    references.push({ source: "metadata", value: message.rawMetadata });
  }

  const resolved = [];
  const usedImageIds = new Set();
  const candidateMap = new Map();

  for (const image of state.index.images) {
    const keys = new Set();
    keys.add(image.name.toLowerCase());
    keys.add(image.relativePath.toLowerCase());

    const fileServiceMatch = image.name.toLowerCase().match(/(file-[a-z0-9]+)/);
    if (fileServiceMatch) {
      keys.add(fileServiceMatch[1]);
    }

    const sedimentMatch = image.name.toLowerCase().match(/(file_[a-z0-9]+)/);
    if (sedimentMatch) {
      keys.add(sedimentMatch[1]);
    }

    for (const key of keys) {
      if (!candidateMap.has(key)) {
        candidateMap.set(key, image);
      }
    }
  }

  for (const reference of references) {
    const candidates = collectImageReferenceCandidates(reference.value, []);
    for (const candidate of candidates) {
      const pointerKey = extractPointerKey(candidate);
      let image = candidateMap.get(pointerKey) || null;

      if ((!image || usedImageIds.has(image.id))) {
        image = state.index.images.find(
          (item) => !usedImageIds.has(item.id) && matchesImageCandidate(item, candidate),
        );
      }

      if (!image) {
        continue;
      }

      usedImageIds.add(image.id);
      resolved.push({
        image,
        reference: reference.value,
      });
    }
  }

  return resolved;
}

function addLookupEntry(map, key, imageId) {
  if (!key) {
    return;
  }

  const existing = map.get(key) || [];
  if (!existing.includes(imageId)) {
    existing.push(imageId);
    map.set(key, existing);
  }
}

function buildImageLookup(images) {
  const lookup = new Map();

  for (const image of images) {
    const keys = new Set();
    keys.add(image.name.toLowerCase());
    keys.add(image.relativePath.toLowerCase());

    const fileServiceMatch = image.name.toLowerCase().match(/(file-[a-z0-9]+)/);
    if (fileServiceMatch) {
      keys.add(fileServiceMatch[1]);
    }

    const sedimentMatch = image.name.toLowerCase().match(/(file_[a-z0-9]+)/);
    if (sedimentMatch) {
      keys.add(sedimentMatch[1]);
    }

    for (const key of keys) {
      addLookupEntry(lookup, key, image.id);
    }
  }

  return lookup;
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
          const pointerKey = extractPointerKey(candidate);
          const matchingIds = imageLookup.get(pointerKey) || [];
          let image = matchingIds
            .map((imageId) => imageById.get(imageId))
            .find((item) => item && !usedImageIds.has(item.id));

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

window.ChatBrowser.attachments = {
  getMessageAttachmentKey,
  collectImageReferenceCandidates,
  hasStructuredMessageContent,
  extractPointerKey,
  buildMessageAssetMap,
  resolveMessageImages,
};
