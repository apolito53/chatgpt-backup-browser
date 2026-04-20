// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
};

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

const state: AppState = {
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

const elements: ElementsRegistry = {
  fileInput: query<HTMLInputElement>("#file-input"),
  folderInput: query<HTMLInputElement>("#folder-input"),
  sourceTabButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-source]")),
  folderSourcePanel: query<HTMLElement>("#folder-source-panel"),
  fileSourcePanel: query<HTMLElement>("#file-source-panel"),
  loadSample: query<HTMLButtonElement>("#load-sample"),
  searchInput: query<HTMLInputElement>("#search-input"),
  sortSelect: query<HTMLSelectElement>("#sort-select"),
  roleWrap: query<HTMLElement>("#role-filter-wrap"),
  roleSelect: query<HTMLSelectElement>("#role-select"),
  status: query<HTMLElement>("#status"),
  progress: query<HTMLProgressElement>("#progress"),
  tabButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-view]")),
  listTitle: query<HTMLElement>("#list-title"),
  conversationList: query<HTMLElement>("#conversation-list"),
  listPagerTop: query<HTMLElement>("#list-pager-top"),
  listPagerBottom: query<HTMLElement>("#list-pager-bottom"),
  prevListPageTop: query<HTMLButtonElement>("#prev-list-page-top"),
  nextListPageTop: query<HTMLButtonElement>("#next-list-page-top"),
  prevListPageBottom: query<HTMLButtonElement>("#prev-list-page-bottom"),
  nextListPageBottom: query<HTMLButtonElement>("#next-list-page-bottom"),
  listPagePositionTop: query<HTMLElement>("#list-page-position-top"),
  listPagePositionBottom: query<HTMLElement>("#list-page-position-bottom"),
  listPageSizeTop: query<HTMLSelectElement>("#list-page-size-top"),
  listPageSizeBottom: query<HTMLSelectElement>("#list-page-size-bottom"),
  listPageJumpTop: query<HTMLFormElement>("#list-page-jump-top"),
  listPageJumpBottom: query<HTMLFormElement>("#list-page-jump-bottom"),
  listPageInputTop: query<HTMLInputElement>("#list-page-input-top"),
  listPageInputBottom: query<HTMLInputElement>("#list-page-input-bottom"),
  resultCaption: query<HTMLElement>("#result-caption"),
  statConversations: query<HTMLElement>("#stat-conversations"),
  statMessages: query<HTMLElement>("#stat-messages"),
  statImages: query<HTMLElement>("#stat-images"),
  statResults: query<HTMLElement>("#stat-results"),
  emptyState: query<HTMLElement>("#empty-state"),
  conversationView: query<HTMLElement>("#conversation-view"),
  conversationTitle: query<HTMLElement>("#conversation-title"),
  conversationDates: query<HTMLElement>("#conversation-dates"),
  conversationCount: query<HTMLElement>("#conversation-count"),
  conversationMessages: query<HTMLElement>("#conversation-messages"),
  conversationRawDetails: query<HTMLDetailsElement>("#conversation-raw-details"),
  conversationRawOutput: query<HTMLElement>("#conversation-raw-output"),
  prevConversationTop: query<HTMLButtonElement>("#prev-conversation-top"),
  nextConversationTop: query<HTMLButtonElement>("#next-conversation-top"),
  prevConversationBottom: query<HTMLButtonElement>("#prev-conversation-bottom"),
  nextConversationBottom: query<HTMLButtonElement>("#next-conversation-bottom"),
  conversationPositionTop: query<HTMLElement>("#conversation-position-top"),
  conversationPositionBottom: query<HTMLElement>("#conversation-position-bottom"),
  imageView: query<HTMLElement>("#image-view"),
  imageCount: query<HTMLElement>("#image-count"),
  imageGrid: query<HTMLElement>("#image-grid"),
  imagePreview: query<HTMLElement>("#image-preview"),
  imagePreviewName: query<HTMLElement>("#image-preview-name"),
  imagePreviewMeta: query<HTMLElement>("#image-preview-meta"),
  imagePreviewPath: query<HTMLElement>("#image-preview-path"),
  appVersion: query<HTMLElement>("#app-version"),
  openChangelog: query<HTMLButtonElement>("#open-changelog"),
  closeChangelog: query<HTMLButtonElement>("#close-changelog"),
  changelogModal: query<HTMLElement>("#changelog-modal"),
  changelogList: query<HTMLElement>("#changelog-list"),
  changelogCloseTargets: Array.from(document.querySelectorAll<HTMLElement>("[data-close-changelog]")),
};

function saveUiState(): void {
  const payload: UiStatePayload = {
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

function loadUiState(): UiStatePayload | null {
  try {
    const raw = sessionStorage.getItem(UI_STATE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as UiStatePayload;
  } catch (error) {
    console.warn("Failed to restore UI state:", error);
    return null;
  }
}

function setSourceMode(mode: SourceMode): void {
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

function applyUiState(uiState: UiStatePayload | null): void {
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
