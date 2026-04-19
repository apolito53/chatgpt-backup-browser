const STORAGE_KEY = "chatgpt-backup-browser:index";
const UI_STATE_KEY = "chatgpt-backup-browser:ui-state";
const ARCHIVE_DB_NAME = "chatgpt-backup-browser";
const ARCHIVE_DB_VERSION = 1;
const ARCHIVE_SESSION_STORE = "sessions";
const APP_VERSION = "0.4.0";
const CHANGELOG_ENTRIES = [
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
];
const HIDDEN_MESSAGE_FLAGS = [
  "is_visually_hidden_from_conversation",
  "is_user_system_message",
];
const DEFAULT_CONVERSATION_LIST_PAGE_SIZE = 25;
const CONVERSATION_LIST_PAGE_SIZE_OPTIONS = new Set([10, 25, 50, 100]);
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
]);

const state = {
  index: null,
  filteredConversations: [],
  filteredImages: [],
  selectedConversationId: null,
  selectedImageId: null,
  activeView: "conversations",
  objectUrls: [],
  cacheMode: "single-file",
  sourceMode: "folder",
  conversationListPage: 0,
  conversationListPageSize: DEFAULT_CONVERSATION_LIST_PAGE_SIZE,
  rawConversationMap: new Map(),
  messageAssetMap: new Map(),
  currentSessionKey: null,
};

const elements = {
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  sourceTabButtons: Array.from(document.querySelectorAll("[data-source]")),
  folderSourcePanel: document.querySelector("#folder-source-panel"),
  fileSourcePanel: document.querySelector("#file-source-panel"),
  loadSample: document.querySelector("#load-sample"),
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  roleWrap: document.querySelector("#role-filter-wrap"),
  roleSelect: document.querySelector("#role-select"),
  status: document.querySelector("#status"),
  progress: document.querySelector("#progress"),
  tabButtons: Array.from(document.querySelectorAll("[data-view]")),
  listTitle: document.querySelector("#list-title"),
  conversationList: document.querySelector("#conversation-list"),
  listPagerTop: document.querySelector("#list-pager-top"),
  listPagerBottom: document.querySelector("#list-pager-bottom"),
  prevListPageTop: document.querySelector("#prev-list-page-top"),
  nextListPageTop: document.querySelector("#next-list-page-top"),
  prevListPageBottom: document.querySelector("#prev-list-page-bottom"),
  nextListPageBottom: document.querySelector("#next-list-page-bottom"),
  listPagePositionTop: document.querySelector("#list-page-position-top"),
  listPagePositionBottom: document.querySelector("#list-page-position-bottom"),
  listPageSizeTop: document.querySelector("#list-page-size-top"),
  listPageSizeBottom: document.querySelector("#list-page-size-bottom"),
  listPageJumpTop: document.querySelector("#list-page-jump-top"),
  listPageJumpBottom: document.querySelector("#list-page-jump-bottom"),
  listPageInputTop: document.querySelector("#list-page-input-top"),
  listPageInputBottom: document.querySelector("#list-page-input-bottom"),
  resultCaption: document.querySelector("#result-caption"),
  statConversations: document.querySelector("#stat-conversations"),
  statMessages: document.querySelector("#stat-messages"),
  statImages: document.querySelector("#stat-images"),
  statResults: document.querySelector("#stat-results"),
  emptyState: document.querySelector("#empty-state"),
  conversationView: document.querySelector("#conversation-view"),
  conversationTitle: document.querySelector("#conversation-title"),
  conversationDates: document.querySelector("#conversation-dates"),
  conversationCount: document.querySelector("#conversation-count"),
  conversationMessages: document.querySelector("#conversation-messages"),
  conversationRawDetails: document.querySelector("#conversation-raw-details"),
  conversationRawOutput: document.querySelector("#conversation-raw-output"),
  prevConversationTop: document.querySelector("#prev-conversation-top"),
  nextConversationTop: document.querySelector("#next-conversation-top"),
  prevConversationBottom: document.querySelector("#prev-conversation-bottom"),
  nextConversationBottom: document.querySelector("#next-conversation-bottom"),
  conversationPositionTop: document.querySelector("#conversation-position-top"),
  conversationPositionBottom: document.querySelector("#conversation-position-bottom"),
  imageView: document.querySelector("#image-view"),
  imageCount: document.querySelector("#image-count"),
  imageGrid: document.querySelector("#image-grid"),
  imagePreview: document.querySelector("#image-preview"),
  imagePreviewName: document.querySelector("#image-preview-name"),
  imagePreviewMeta: document.querySelector("#image-preview-meta"),
  imagePreviewPath: document.querySelector("#image-preview-path"),
  appVersion: document.querySelector("#app-version"),
  openChangelog: document.querySelector("#open-changelog"),
  closeChangelog: document.querySelector("#close-changelog"),
  changelogModal: document.querySelector("#changelog-modal"),
  changelogList: document.querySelector("#changelog-list"),
  changelogCloseTargets: Array.from(document.querySelectorAll("[data-close-changelog]")),
};

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

function normalizeStats(index) {
  const conversations = Array.isArray(index?.conversations) ? index.conversations : [];
  const images = Array.isArray(index?.images) ? index.images : [];
  const messageCount = conversations.reduce(
    (sum, conversation) => sum + (Number.isFinite(conversation.messageCount) ? conversation.messageCount : 0),
    0,
  );

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

async function saveSessionRecord({ sessionKey, sourceMode, sourceLabel, index }) {
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
    rawConversationEntries: Array.from(
      (index.rawConversationMap instanceof Map ? index.rawConversationMap : new Map()).entries(),
    ),
  });
  await transactionToPromise(transaction);
}

async function loadLatestSessionRecord() {
  const database = await openArchiveDatabase();
  if (!database) {
    return null;
  }

  const transaction = database.transaction(ARCHIVE_SESSION_STORE, "readonly");
  const store = transaction.objectStore(ARCHIVE_SESSION_STORE);
  const records = await requestToPromise(store.getAll());
  await transactionToPromise(transaction);

  if (!records.length) {
    return null;
  }

  const latest = records
    .slice()
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  const index = deserializeStoredIndex(latest);
  if (!index) {
    return null;
  }

  return {
    sessionKey: latest.key,
    sourceMode: latest.sourceMode || "file",
    index,
    sourceLabel: latest.sourceLabel || index.source || "cached session",
  };
}

function saveUiState() {
  const payload = {
    activeView: state.activeView,
    selectedConversationId: state.selectedConversationId,
    selectedImageId: state.selectedImageId,
    search: elements.searchInput.value,
    sort: elements.sortSelect.value,
    role: elements.roleSelect.value,
    sourceMode: state.sourceMode,
    conversationListPage: state.conversationListPage,
    conversationListPageSize: state.conversationListPageSize,
  };

  try {
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to save UI state:", error);
  }
}

function loadUiState() {
  try {
    const raw = sessionStorage.getItem(UI_STATE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to restore UI state:", error);
    return null;
  }
}

function setSourceMode(mode) {
  state.sourceMode = mode;

  for (const button of elements.sourceTabButtons) {
    const isActive = button.dataset.source === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  elements.folderSourcePanel.hidden = mode !== "folder";
  elements.fileSourcePanel.hidden = mode !== "file";
  saveUiState();
}

function applyUiState(uiState) {
  if (!uiState) {
    return;
  }

  if (typeof uiState.search === "string") {
    elements.searchInput.value = uiState.search;
  }
  if (typeof uiState.sort === "string") {
    elements.sortSelect.value = uiState.sort;
  }
  if (typeof uiState.role === "string") {
    elements.roleSelect.value = uiState.role;
  }
  if (typeof uiState.selectedConversationId === "string") {
    state.selectedConversationId = uiState.selectedConversationId;
  }
  if (typeof uiState.selectedImageId === "string") {
    state.selectedImageId = uiState.selectedImageId;
  }
  if (Number.isInteger(uiState.conversationListPage) && uiState.conversationListPage >= 0) {
    state.conversationListPage = uiState.conversationListPage;
  }
  if (
    Number.isInteger(uiState.conversationListPageSize)
    && CONVERSATION_LIST_PAGE_SIZE_OPTIONS.has(uiState.conversationListPageSize)
  ) {
    state.conversationListPageSize = uiState.conversationListPageSize;
  }
  if (uiState.activeView === "images" || uiState.activeView === "conversations") {
    state.activeView = uiState.activeView;
  }
  if (uiState.sourceMode === "file" || uiState.sourceMode === "folder") {
    setSourceMode(uiState.sourceMode);
  }

  elements.listPageSizeTop.value = String(state.conversationListPageSize);
  elements.listPageSizeBottom.value = String(state.conversationListPageSize);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function setProgress(value, hidden = false) {
  elements.progress.hidden = hidden;
  if (!hidden) {
    elements.progress.value = value;
  }
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "Unknown date";
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function renderChangelog() {
  elements.appVersion.textContent = `v${APP_VERSION}`;

  const cards = CHANGELOG_ENTRIES.map((entry) => {
    const article = document.createElement("article");
    article.className = "changelog-entry";

    const changes = entry.changes
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");

    article.innerHTML = `
      <div class="changelog-entry-header">
        <h3>v${escapeHtml(entry.version)}</h3>
        <span class="changelog-entry-date">${escapeHtml(entry.date)}</span>
      </div>
      <ul>${changes}</ul>
    `;

    return article;
  });

  elements.changelogList.replaceChildren(...cards);
}

function setChangelogOpen(isOpen) {
  elements.changelogModal.hidden = !isOpen;
  document.body.classList.toggle("modal-open", isOpen);
}

function getMessageAttachmentKey(message) {
  return `${message.conversationId || "conversation"}::${message.id || "message"}`;
}

function getRoleLabel(message) {
  if (message.authorName) {
    return `${message.role} (${message.authorName})`;
  }
  return message.role;
}

function compareConversations(a, b, mode) {
  switch (mode) {
    case "updated-asc":
      return (a.updatedAt || 0) - (b.updatedAt || 0);
    case "created-desc":
      return (b.createdAt || 0) - (a.createdAt || 0);
    case "created-asc":
      return (a.createdAt || 0) - (b.createdAt || 0);
    case "title-asc":
      return a.title.localeCompare(b.title);
    case "message-count-desc":
      return b.messageCount - a.messageCount;
    case "updated-desc":
    default:
      return (b.updatedAt || 0) - (a.updatedAt || 0);
  }
}

function compareImages(a, b, mode) {
  switch (mode) {
    case "created-desc":
    case "updated-desc":
      return (b.lastModified || 0) - (a.lastModified || 0);
    case "updated-asc":
    case "created-asc":
      return (a.lastModified || 0) - (b.lastModified || 0);
    case "title-asc":
      return a.name.localeCompare(b.name);
    case "message-count-desc":
      return b.size - a.size;
    default:
      return a.relativePath.localeCompare(b.relativePath);
  }
}

function getConversationListPageCount() {
  return Math.max(1, Math.ceil(state.filteredConversations.length / state.conversationListPageSize));
}

function clampConversationListPage() {
  state.conversationListPage = Math.max(0, Math.min(state.conversationListPage, getConversationListPageCount() - 1));
}

function ensureSelectedConversationPage() {
  const selectedIndex = state.filteredConversations.findIndex(
    (conversation) => conversation.id === state.selectedConversationId,
  );

  if (selectedIndex === -1) {
    clampConversationListPage();
    return;
  }

  state.conversationListPage = Math.floor(selectedIndex / state.conversationListPageSize);
}

function updateConversationListPager() {
  const isVisible = state.activeView === "conversations" && state.filteredConversations.length > state.conversationListPageSize;
  const totalPages = getConversationListPageCount();
  const currentPage = state.conversationListPage + 1;
  const label = `${currentPage} of ${totalPages}`;

  elements.listPagerTop.hidden = !isVisible;
  elements.listPagerBottom.hidden = !isVisible;
  elements.listPagePositionTop.textContent = label;
  elements.listPagePositionBottom.textContent = label;
  elements.listPageSizeTop.value = String(state.conversationListPageSize);
  elements.listPageSizeBottom.value = String(state.conversationListPageSize);
  elements.listPageInputTop.value = String(currentPage);
  elements.listPageInputBottom.value = String(currentPage);
  elements.listPageInputTop.max = String(totalPages);
  elements.listPageInputBottom.max = String(totalPages);

  const disablePrev = state.conversationListPage <= 0;
  const disableNext = state.conversationListPage >= totalPages - 1;

  elements.prevListPageTop.disabled = disablePrev;
  elements.prevListPageBottom.disabled = disablePrev;
  elements.nextListPageTop.disabled = disableNext;
  elements.nextListPageBottom.disabled = disableNext;
  elements.listPageInputTop.disabled = !isVisible;
  elements.listPageInputBottom.disabled = !isVisible;
}

function moveConversationListPage(direction) {
  state.conversationListPage += direction;
  clampConversationListPage();

  const start = state.conversationListPage * state.conversationListPageSize;
  const nextConversation = state.filteredConversations[start];
  if (nextConversation) {
    state.selectedConversationId = nextConversation.id;
  }

  renderConversationsView();
}

function setConversationListPageSize(value) {
  const nextSize = Number(value);
  if (!CONVERSATION_LIST_PAGE_SIZE_OPTIONS.has(nextSize)) {
    return;
  }

  if (nextSize === state.conversationListPageSize) {
    return;
  }

  state.conversationListPageSize = nextSize;
  state.conversationListPage = 0;

  if (state.filteredConversations.length) {
    ensureSelectedConversationPage();
  }

  renderConversationsView();
}

function jumpConversationListPage(value) {
  const requestedPage = Number.parseInt(value, 10);
  if (!Number.isFinite(requestedPage)) {
    updateConversationListPager();
    return;
  }

  const totalPages = getConversationListPageCount();
  state.conversationListPage = Math.max(0, Math.min(requestedPage - 1, totalPages - 1));

  const start = state.conversationListPage * state.conversationListPageSize;
  const nextConversation = state.filteredConversations[start];
  if (nextConversation) {
    state.selectedConversationId = nextConversation.id;
  }

  renderConversationsView();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roleFilterMatches(conversation, role) {
  if (role === "all") {
    return true;
  }
  return conversation.messages.some((message) => message.role === role);
}

function searchMatchesConversation(conversation, query, role) {
  if (!query) {
    return true;
  }

  const lowerQuery = query.toLowerCase();
  if (role === "all") {
    return conversation.searchBlob.includes(lowerQuery);
  }

  if (conversation.title.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  return conversation.messages.some(
    (message) => message.role === role && message.text.toLowerCase().includes(lowerQuery),
  );
}

function searchMatchesImage(image, query) {
  if (!query) {
    return true;
  }

  const lowerQuery = query.toLowerCase();
  return image.searchBlob.includes(lowerQuery);
}

function getVisibleMessages(conversation) {
  const role = elements.roleSelect.value;
  if (role === "all") {
    return conversation.messages;
  }
  return conversation.messages.filter((message) => message.role === role);
}

function setActiveView(view) {
  state.activeView = view;
  for (const button of elements.tabButtons) {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  elements.roleWrap.hidden = view !== "conversations";
  elements.searchInput.placeholder = view === "images"
    ? "Search image filenames or paths"
    : "Search titles, messages, or both";
  elements.listTitle.textContent = view === "images" ? "Images" : "Conversations";
  renderActiveView();
  saveUiState();
}

function updateStats() {
  if (!state.index) {
    elements.statConversations.textContent = "0";
    elements.statMessages.textContent = "0";
    elements.statImages.textContent = "0";
    elements.statResults.textContent = "0";
    return;
  }

  elements.statConversations.textContent = state.index.stats.conversations.toLocaleString();
  elements.statMessages.textContent = state.index.stats.messages.toLocaleString();
  elements.statImages.textContent = state.index.stats.images.toLocaleString();
}

function renderConversation(conversation) {
  if (!conversation) {
    elements.conversationView.hidden = true;
    elements.conversationRawDetails.open = false;
    elements.conversationRawOutput.textContent = "No conversation selected.";
    updateConversationPager();
    updateConversationListPager();
    return;
  }

  const visibleMessages = getVisibleMessages(conversation);
  elements.conversationView.hidden = false;
  elements.conversationTitle.textContent = conversation.title;
  elements.conversationDates.textContent = `Created ${formatDate(conversation.createdAt)} | Updated ${formatDate(conversation.updatedAt)}`;
  elements.conversationCount.textContent = `${visibleMessages.length} visible message${visibleMessages.length === 1 ? "" : "s"}`;

  if (!visibleMessages.length) {
    elements.conversationMessages.innerHTML = '<div class="empty-note">This conversation exists, but nothing matches the current role filter.</div>';
    return;
  }

  const cards = visibleMessages.map((message) => {
    const card = document.createElement("section");
    card.className = `message-card ${message.role}`;

    const body = document.createElement("div");
    body.className = "message-body";

    const attachments = resolveMessageImages(message);
    const hasBodyText = typeof message.text === "string" && message.text.trim().length > 0;

    if (hasBodyText) {
      body.textContent = message.text;
    } else if (attachments.length) {
      const placeholder = document.createElement("p");
      placeholder.className = "message-structured-placeholder";
      placeholder.textContent = "This message contains media or structured content.";
      body.appendChild(placeholder);
    }

    card.innerHTML = `
      <div class="message-header">
        <div class="message-author">${escapeHtml(getRoleLabel(message))}</div>
        <div class="message-meta">${escapeHtml(formatDate(message.createTime || message.updateTime))}</div>
      </div>
    `;
    card.appendChild(body);

    if (attachments.length) {
      const attachmentStack = document.createElement("div");
      attachmentStack.className = "message-attachments";

      for (const attachment of attachments) {
        const block = document.createElement("section");
        block.className = "message-attachment";

        const header = document.createElement("div");
        header.className = "message-attachment-header";
        header.innerHTML = `
          <span class="message-attachment-title">${escapeHtml(attachment.image.name)}</span>
          <span class="subtle">${escapeHtml(attachment.image.relativePath)}</span>
        `;

        const preview = attachment.image.objectUrl
          ? Object.assign(document.createElement("img"), {
            src: attachment.image.objectUrl,
            alt: attachment.image.name,
          })
          : Object.assign(document.createElement("div"), {
            className: "message-attachment-missing",
            textContent: "Image preview unavailable until the backup folder is loaded again.",
          });

        const details = document.createElement("details");
        details.innerHTML = `
          <summary>Show metadata</summary>
          <pre class="metadata-block">${escapeHtml(JSON.stringify(attachment.reference, null, 2))}</pre>
        `;

        block.appendChild(header);
        block.appendChild(preview);
        block.appendChild(details);
        attachmentStack.appendChild(block);
      }

      body.appendChild(attachmentStack);
    }
    return card;
  });

  elements.conversationMessages.replaceChildren(...cards);
  const rawConversation = state.rawConversationMap.get(conversation.id);
  elements.conversationRawOutput.textContent = rawConversation
    ? JSON.stringify(rawConversation, null, 2)
    : "Raw conversation JSON is unavailable for this session.";
  updateConversationPager();
  updateConversationListPager();
  saveUiState();
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

function moveConversationSelection(direction) {
  if (!state.filteredConversations.length) {
    return;
  }

  const currentIndex = state.filteredConversations.findIndex(
    (conversation) => conversation.id === state.selectedConversationId,
  );

  if (currentIndex === -1) {
    state.selectedConversationId = state.filteredConversations[0].id;
    renderConversationsView();
    return;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= state.filteredConversations.length) {
    return;
  }

  state.selectedConversationId = state.filteredConversations[nextIndex].id;
  ensureSelectedConversationPage();
  renderConversationsView();
}

function jumpToConversationIndex(index) {
  if (!state.filteredConversations.length) {
    return;
  }

  const clampedIndex = Math.max(0, Math.min(index, state.filteredConversations.length - 1));
  const conversation = state.filteredConversations[clampedIndex];
  if (!conversation) {
    return;
  }

  state.selectedConversationId = conversation.id;
  ensureSelectedConversationPage();
  renderConversationsView();
}

function buildConversationPagerTokens(total, currentIndex) {
  if (total <= 0 || currentIndex < 0) {
    return [];
  }

  const pages = new Set([0, total - 1, currentIndex]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (currentIndex - offset >= 0) {
      pages.add(currentIndex - offset);
    }
    if (currentIndex + offset < total) {
      pages.add(currentIndex + offset);
    }
  }

  const orderedPages = Array.from(pages).sort((a, b) => a - b);
  const tokens = [];

  orderedPages.forEach((pageIndex, index) => {
    if (index > 0 && pageIndex - orderedPages[index - 1] > 1) {
      tokens.push({ type: "ellipsis", key: `ellipsis-${orderedPages[index - 1]}-${pageIndex}` });
    }
    tokens.push({ type: "page", value: pageIndex, key: `page-${pageIndex}` });
  });

  return tokens;
}

function renderConversationPagerPicker(container, total, currentIndex) {
  container.replaceChildren();

  if (!total || currentIndex < 0) {
    container.textContent = "0 of 0";
    return;
  }

  const pages = document.createElement("div");
  pages.className = "pager-pages";

  for (const token of buildConversationPagerTokens(total, currentIndex)) {
    if (token.type === "ellipsis") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pager-ellipsis";
      ellipsis.textContent = "...";
      pages.appendChild(ellipsis);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pager-page-button";
    button.textContent = String(token.value + 1);
    if (token.value === currentIndex) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => {
      jumpToConversationIndex(token.value);
    });
    pages.appendChild(button);
  }

  const totalWrap = document.createElement("div");
  totalWrap.className = "pager-total";

  const ofLabel = document.createElement("span");
  ofLabel.textContent = "of";

  const totalButton = document.createElement("button");
  totalButton.type = "button";
  totalButton.className = "pager-total-button";
  totalButton.textContent = total.toLocaleString();
  totalButton.addEventListener("click", () => {
    jumpToConversationIndex(total - 1);
  });

  totalWrap.append(ofLabel, totalButton);
  container.append(pages, totalWrap);
}

function updateConversationPager() {
  const total = state.filteredConversations.length;
  const currentIndex = state.filteredConversations.findIndex(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const hasSelection = currentIndex !== -1;
  renderConversationPagerPicker(elements.conversationPositionTop, total, currentIndex);
  renderConversationPagerPicker(elements.conversationPositionBottom, total, currentIndex);

  const disablePrev = !hasSelection || currentIndex <= 0;
  const disableNext = !hasSelection || currentIndex >= total - 1;

  elements.prevConversationTop.disabled = disablePrev;
  elements.prevConversationBottom.disabled = disablePrev;
  elements.nextConversationTop.disabled = disableNext;
  elements.nextConversationBottom.disabled = disableNext;
}

function renderConversationsView() {
  const query = elements.searchInput.value.trim();
  const role = elements.roleSelect.value;
  const sort = elements.sortSelect.value;

  if (!state.index) {
    elements.conversationList.innerHTML = "";
    elements.resultCaption.textContent = "No export loaded yet.";
    elements.statResults.textContent = "0";
    state.conversationListPage = 0;
    updateConversationListPager();
    renderConversation(null);
    return;
  }

  state.filteredConversations = state.index.conversations
    .filter((conversation) => roleFilterMatches(conversation, role))
    .filter((conversation) => searchMatchesConversation(conversation, query, role))
    .sort((a, b) => compareConversations(a, b, sort));

  elements.resultCaption.textContent = `${state.filteredConversations.length} matching conversation${state.filteredConversations.length === 1 ? "" : "s"}`;
  elements.statResults.textContent = String(state.filteredConversations.length);

  if (!state.filteredConversations.length) {
    elements.conversationList.innerHTML = '<div class="empty-note">No conversation matches. Try a different search or role filter.</div>';
    state.conversationListPage = 0;
    updateConversationListPager();
    renderConversation(null);
    return;
  }

  if (!state.filteredConversations.some((conversation) => conversation.id === state.selectedConversationId)) {
    state.selectedConversationId = state.filteredConversations[0].id;
  }

  ensureSelectedConversationPage();
  const start = state.conversationListPage * state.conversationListPageSize;
  const end = start + state.conversationListPageSize;
  const pageConversations = state.filteredConversations.slice(start, end);

  const buttons = pageConversations.map((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    if (conversation.id === state.selectedConversationId) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <h3>${escapeHtml(conversation.title)}</h3>
      <p>${escapeHtml(conversation.preview)}</p>
      <div class="conversation-item-meta">
        <span>${conversation.messageCount} messages</span>
        <span>${escapeHtml(formatDate(conversation.updatedAt))}</span>
      </div>
    `;

    button.addEventListener("click", () => {
      state.selectedConversationId = conversation.id;
      ensureSelectedConversationPage();
      renderConversationsView();
    });

    return button;
  });

  elements.conversationList.replaceChildren(...buttons);
  updateConversationListPager();
  renderConversation(
    state.filteredConversations.find((conversation) => conversation.id === state.selectedConversationId) || null,
  );
}

function renderImageDetail(image) {
  if (!image) {
    elements.imagePreview.innerHTML = '<div class="empty-note">Pick an image to preview it here.</div>';
    elements.imagePreviewName.textContent = "No image selected";
    elements.imagePreviewMeta.textContent = "";
    elements.imagePreviewPath.textContent = "";
    return;
  }

  elements.imagePreviewName.textContent = image.name;
  elements.imagePreviewMeta.textContent = `${formatFileSize(image.size)} | ${new Date(image.lastModified).toLocaleString()}`;
  elements.imagePreviewPath.textContent = image.relativePath;
  elements.imagePreview.innerHTML = "";

  if (image.objectUrl) {
    const tag = document.createElement("img");
    tag.src = image.objectUrl;
    tag.alt = image.name;
    tag.className = "image-preview-tag";
    elements.imagePreview.appendChild(tag);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "empty-note";
    placeholder.textContent = "Preview unavailable in the cached index. Reload the backup folder to reattach the actual image file.";
    elements.imagePreview.appendChild(placeholder);
  }
  saveUiState();
}

function renderImagesView() {
  const query = elements.searchInput.value.trim();
  const sort = elements.sortSelect.value;

  if (!state.index) {
    elements.conversationList.innerHTML = "";
    elements.resultCaption.textContent = "No export loaded yet.";
    elements.statResults.textContent = "0";
    updateConversationListPager();
    renderImageDetail(null);
    return;
  }

  state.filteredImages = state.index.images
    .filter((image) => searchMatchesImage(image, query))
    .sort((a, b) => compareImages(a, b, sort));

  elements.resultCaption.textContent = `${state.filteredImages.length} matching image${state.filteredImages.length === 1 ? "" : "s"}`;
  elements.statResults.textContent = String(state.filteredImages.length);
  elements.imageCount.textContent = `${state.filteredImages.length} visible image${state.filteredImages.length === 1 ? "" : "s"}`;

  if (!state.filteredImages.length) {
    elements.conversationList.innerHTML = '<div class="empty-note">No images match. Try a different search.</div>';
    elements.imageGrid.innerHTML = '<div class="empty-note">No images to show.</div>';
    updateConversationListPager();
    renderImageDetail(null);
    return;
  }

  if (!state.filteredImages.some((image) => image.id === state.selectedImageId)) {
    state.selectedImageId = state.filteredImages[0].id;
  }

  const listButtons = state.filteredImages.map((image) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    if (image.id === state.selectedImageId) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <h3>${escapeHtml(image.name)}</h3>
      <p>${escapeHtml(image.relativePath)}</p>
      <div class="conversation-item-meta">
        <span>${formatFileSize(image.size)}</span>
        <span>${escapeHtml(new Date(image.lastModified).toLocaleDateString())}</span>
      </div>
    `;

    button.addEventListener("click", () => {
      state.selectedImageId = image.id;
      renderImagesView();
    });

    return button;
  });

  const tiles = state.filteredImages.map((image) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-tile";
    if (image.id === state.selectedImageId) {
      button.classList.add("active");
    }

    if (image.objectUrl) {
      button.innerHTML = `
        <img src="${image.objectUrl}" alt="${escapeHtml(image.name)}">
        <span>${escapeHtml(image.name)}</span>
      `;
    } else {
      button.innerHTML = `
        <div class="image-tile-placeholder">Preview unavailable</div>
        <span>${escapeHtml(image.name)}</span>
      `;
    }

    button.addEventListener("click", () => {
      state.selectedImageId = image.id;
      renderImagesView();
    });

    return button;
  });

  elements.conversationList.replaceChildren(...listButtons);
  elements.imageGrid.replaceChildren(...tiles);
  updateConversationListPager();
  renderImageDetail(state.filteredImages.find((image) => image.id === state.selectedImageId) || null);
}

function renderActiveView() {
  const hasData = Boolean(state.index);
  elements.emptyState.hidden = hasData;
  elements.conversationView.hidden = state.activeView !== "conversations";
  elements.imageView.hidden = state.activeView !== "images";

  if (!hasData) {
    elements.resultCaption.textContent = "No export loaded yet.";
    elements.conversationList.innerHTML = "";
    elements.statResults.textContent = "0";
    updateConversationListPager();
    return;
  }

  if (state.activeView === "images") {
    renderImagesView();
  } else {
    renderConversationsView();
  }
}

function saveIndex(index) {
  if (state.cacheMode !== "single-file") {
    return;
  }

  try {
    const cacheableIndex = {
      ...index,
      rawConversationMap: undefined,
      messageAssetMap: undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheableIndex));
  } catch (error) {
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
  } catch (error) {
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

function applyIndex(index, sourceLabel) {
  const safeIndex = normalizeIndex(index);
  if (!safeIndex) {
    setStatus("That saved session is unreadable. Reload the backup file or folder.");
    setProgress(0, true);
    return;
  }

  const preferredConversationId = state.selectedConversationId;
  const preferredImageId = state.selectedImageId;
  state.index = safeIndex;
  state.rawConversationMap = safeIndex.rawConversationMap;
  state.messageAssetMap = safeIndex.messageAssetMap;
  state.selectedConversationId = safeIndex.conversations.some((conversation) => conversation.id === preferredConversationId)
    ? preferredConversationId
    : safeIndex.conversations[0]?.id || null;
  state.selectedImageId = safeIndex.images.some((image) => image.id === preferredImageId)
    ? preferredImageId
    : safeIndex.images[0]?.id || null;

  if (state.activeView === "images" && !safeIndex.images.length) {
    state.activeView = "conversations";
  }

  for (const button of elements.tabButtons) {
    const view = button.dataset.view;
    const enabled = view !== "images" || safeIndex.images.length > 0;
    button.disabled = !enabled;
  }

  updateStats();
  setActiveView(state.activeView);
  setStatus(sourceLabel);
  setProgress(0, true);
  saveUiState();
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

function isVisibleMessage(message) {
  if (!message) {
    return false;
  }

  const metadata = message.metadata || {};
  if (HIDDEN_MESSAGE_FLAGS.some((flag) => metadata[flag])) {
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

function buildConversationIndex(rawText) {
  const payload = extractConversationArray(rawText);
  const rawData = JSON.parse(payload);
  const conversations = rawData.map(summarizeConversation);
  const totalMessages = conversations.reduce((sum, conversation) => sum + conversation.messageCount, 0);
  const rawConversationMap = new Map();

  rawData.forEach((conversation, index) => {
    const id = conversation.conversation_id || conversation.id || `conversation-${index}`;
    rawConversationMap.set(id, conversation);
  });

  return {
    conversations,
    totalMessages,
    rawConversationMap,
  };
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

async function parseSingleFile(file) {
  setSourceMode("file");
  state.cacheMode = "single-file";
  state.currentSessionKey = buildSessionKey({
    sourceMode: "file",
    sourceName: file.name,
    fingerprint: buildFileFingerprint(file),
  });
  revokeObjectUrls();
  setStatus(`Loading ${file.name}...`);
  setProgress(5, false);

  try {
    const rawText = await file.text();
    setStatus("Reading export...");
    setProgress(25, false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const conversationData = buildConversationIndex(rawText);
    const index = buildBackupIndex({
      conversations: conversationData.conversations,
      images: [],
      source: file.name,
    });
    index.rawConversationMap = conversationData.rawConversationMap;

    saveIndex(index);
    applyIndex(index, `Loaded ${file.name}.`);
    saveSessionRecord({
      sessionKey: state.currentSessionKey,
      sourceMode: "file",
      sourceLabel: file.name,
      index,
    }).catch((error) => {
      console.warn("Failed to persist single-file session:", error);
    });
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : "Failed to parse export.");
    setProgress(0, true);
  }
}

async function parseFolder(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return;
  }

  setSourceMode("folder");
  state.cacheMode = "folder";
  revokeObjectUrls();
  setStatus("Scanning backup folder...");
  setProgress(10, false);

  const conversationFile = files.find((file) => (file.webkitRelativePath || file.name).endsWith("conversations.json"))
    || files.find((file) => (file.webkitRelativePath || file.name).endsWith("chat.html"));

  if (!conversationFile) {
    setStatus("Could not find conversations.json or chat.html inside that folder.");
    setProgress(0, true);
    return;
  }

  try {
    const rawText = await conversationFile.text();
    setStatus("Parsing conversations...");
    setProgress(35, false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const conversationData = buildConversationIndex(rawText);
    setStatus("Indexing images...");
    setProgress(70, false);

    const images = buildImagesIndex(files);
    const rootSegment = (conversationFile.webkitRelativePath || "").split("/")[0] || "backup folder";
    state.currentSessionKey = buildSessionKey({
      sourceMode: "folder",
      sourceName: rootSegment,
      fingerprint: [buildFileFingerprint(conversationFile), files.length].join(":"),
    });

    const index = buildBackupIndex({
      conversations: conversationData.conversations,
      images,
      source: rootSegment,
    });
    index.rawConversationMap = conversationData.rawConversationMap;

    applyIndex(index, `Loaded folder ${rootSegment}. Folder sessions are kept in this tab only.`);
    saveSessionRecord({
      sessionKey: state.currentSessionKey,
      sourceMode: "folder",
      sourceLabel: rootSegment,
      index,
    }).catch((error) => {
      console.warn("Failed to persist folder session:", error);
    });
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : "Failed to parse backup folder.");
    setProgress(0, true);
  }
}

elements.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }
  parseSingleFile(file);
});

elements.folderInput.addEventListener("change", (event) => {
  const files = event.target.files || [];
  if (!files.length) {
    return;
  }
  parseFolder(files);
});

elements.loadSample.addEventListener("click", async () => {
  try {
    const storedSession = await loadLatestSessionRecord();
    if (storedSession) {
      state.cacheMode = storedSession.sourceMode === "folder" ? "folder" : "single-file";
      state.currentSessionKey = storedSession.sessionKey;
      revokeObjectUrls();
      applyIndex(
        storedSession.index,
        storedSession.sourceMode === "folder"
          ? `Restored cached folder index for ${storedSession.sourceLabel}. Re-select the backup folder to reattach live image previews.`
          : `Restored cached session for ${storedSession.sourceLabel}.`,
      );
      return;
    }

    const cached = loadSavedIndex();
    if (cached) {
      state.cacheMode = "single-file";
      revokeObjectUrls();
      applyIndex(cached, "Restored last single-file session from browser storage.");
      return;
    }

    setStatus("No cached session found yet. Load chat.html, conversations.json, or the whole backup folder first.");
  } catch (error) {
    console.error(error);
    setStatus("Couldn't restore the saved session. Reload the source file or folder and I'll cache it again.");
    setProgress(0, true);
  }
});

elements.searchInput.addEventListener("input", () => {
  renderActiveView();
  saveUiState();
});

elements.sortSelect.addEventListener("change", () => {
  renderActiveView();
  saveUiState();
});

elements.roleSelect.addEventListener("change", () => {
  renderActiveView();
  saveUiState();
});

elements.prevConversationTop.addEventListener("click", () => {
  moveConversationSelection(-1);
});

elements.prevConversationBottom.addEventListener("click", () => {
  moveConversationSelection(-1);
});

elements.nextConversationTop.addEventListener("click", () => {
  moveConversationSelection(1);
});

elements.nextConversationBottom.addEventListener("click", () => {
  moveConversationSelection(1);
});

elements.prevListPageTop.addEventListener("click", () => {
  moveConversationListPage(-1);
});

elements.prevListPageBottom.addEventListener("click", () => {
  moveConversationListPage(-1);
});

elements.nextListPageTop.addEventListener("click", () => {
  moveConversationListPage(1);
});

elements.nextListPageBottom.addEventListener("click", () => {
  moveConversationListPage(1);
});

elements.listPageSizeTop.addEventListener("change", (event) => {
  setConversationListPageSize(event.target.value);
});

elements.listPageSizeBottom.addEventListener("change", (event) => {
  setConversationListPageSize(event.target.value);
});

elements.listPageJumpTop.addEventListener("submit", (event) => {
  event.preventDefault();
  jumpConversationListPage(elements.listPageInputTop.value);
});

elements.listPageJumpBottom.addEventListener("submit", (event) => {
  event.preventDefault();
  jumpConversationListPage(elements.listPageInputBottom.value);
});

elements.openChangelog.addEventListener("click", () => {
  setChangelogOpen(true);
});

elements.closeChangelog.addEventListener("click", () => {
  setChangelogOpen(false);
});

for (const target of elements.changelogCloseTargets) {
  target.addEventListener("click", () => {
    setChangelogOpen(false);
  });
}

for (const button of elements.tabButtons) {
  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }
    setActiveView(button.dataset.view);
  });
}

for (const button of elements.sourceTabButtons) {
  button.addEventListener("click", () => {
    setSourceMode(button.dataset.source);
  });
}

window.addEventListener("beforeunload", () => {
  revokeObjectUrls();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.changelogModal.hidden) {
    setChangelogOpen(false);
  }
});

const uiState = loadUiState();
if (uiState) {
  applyUiState(uiState);
} else {
  setSourceMode("folder");
}

renderChangelog();

async function restoreFromPickerOrCache() {
  if (elements.folderInput.files && elements.folderInput.files.length) {
    await parseFolder(elements.folderInput.files);
    return;
  }

  if (elements.fileInput.files && elements.fileInput.files.length) {
    await parseSingleFile(elements.fileInput.files[0]);
    return;
  }

  try {
    const storedSession = await loadLatestSessionRecord();
    if (storedSession) {
      state.cacheMode = storedSession.sourceMode === "folder" ? "folder" : "single-file";
      state.currentSessionKey = storedSession.sessionKey;
      applyIndex(
        storedSession.index,
        storedSession.sourceMode === "folder"
          ? `Restored cached folder index for ${storedSession.sourceLabel}. Re-select the backup folder to reattach live image previews.`
          : `Restored cached session for ${storedSession.sourceLabel}.`,
      );
      return;
    }

    const cached = loadSavedIndex();
    if (cached) {
      applyIndex(cached, "Restored last single-file session from browser storage.");
    } else {
      updateStats();
      elements.tabButtons.find((button) => button.dataset.view === "images").disabled = true;
    }
  } catch (error) {
    console.error(error);
    setStatus("Saved session restore failed. Reload the original backup source to refresh the cache.");
    setProgress(0, true);
  }
}

restoreFromPickerOrCache();
