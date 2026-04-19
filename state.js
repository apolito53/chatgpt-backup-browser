// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const STORAGE_KEY = "chatgpt-backup-browser:index";
const UI_STATE_KEY = "chatgpt-backup-browser:ui-state";
const ARCHIVE_DB_NAME = "chatgpt-backup-browser";
const ARCHIVE_DB_VERSION = 1;
const ARCHIVE_SESSION_STORE = "sessions";
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

window.ChatBrowser.stateModule = {
  STORAGE_KEY,
  UI_STATE_KEY,
  ARCHIVE_DB_NAME,
  ARCHIVE_DB_VERSION,
  ARCHIVE_SESSION_STORE,
  HIDDEN_MESSAGE_FLAGS,
  DEFAULT_CONVERSATION_LIST_PAGE_SIZE,
  CONVERSATION_LIST_PAGE_SIZE_OPTIONS,
  IMAGE_EXTENSIONS,
  state,
  elements,
  saveUiState,
  loadUiState,
  setSourceMode,
  applyUiState,
};
})();
