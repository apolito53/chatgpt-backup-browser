// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const { state, elements, saveUiState } = window.ChatBrowser.stateModule!;
const { normalizeIndex } = window.ChatBrowser.storage!;
const { setStatus, setProgress } = window.ChatBrowser.ui!;
const {
  moveConversationListPage,
  setConversationListPageSize,
  jumpConversationListPage,
  renderConversationsView,
  moveConversationSelection,
  loadSelectedConversationDetails,
  updateConversationListPager,
} = window.ChatBrowser.conversationRender!;
const { renderImagesView } = window.ChatBrowser.imageRender!;

function setActiveView(view: ActiveView): void {
  state.activeView = view;
  for (const button of elements.tabButtons) {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  elements.roleWrap.hidden = view !== "conversations";
  elements.modelWrap.hidden = view !== "conversations";
  elements.searchInput.placeholder = view === "images"
    ? "Search image filenames or paths"
    : "Search titles, messages, or both";
  elements.listTitle.textContent = view === "images" ? "Images" : "Conversations";
  renderActiveView();
  saveUiState();
}

function updateStats(): void {
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

function renderActiveView(): void {
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

function applyIndex(index: unknown, sourceLabel: string): void {
  const safeIndex = normalizeIndex(index) as ArchiveIndex | null;
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

window.ChatBrowser.render = {
  moveConversationListPage,
  setConversationListPageSize,
  jumpConversationListPage,
  setActiveView,
  updateStats,
  renderActiveView,
  applyIndex,
  moveConversationSelection,
  loadSelectedConversationDetails,
};
})();
