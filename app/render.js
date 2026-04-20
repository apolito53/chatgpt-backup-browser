"use strict";
// @ts-check
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const { state, elements, saveUiState } = window.ChatBrowser.stateModule;
    const { normalizeIndex } = window.ChatBrowser.storage;
    const { setStatus, setProgress } = window.ChatBrowser.ui;
    const { moveConversationListPage, setConversationListPageSize, jumpConversationListPage, renderConversationsView, moveConversationSelection, loadSelectedConversationDetails, updateConversationListPager, getConversationIdFromLocation, setSelectedConversation, } = window.ChatBrowser.conversationRender;
    const { renderImagesView } = window.ChatBrowser.imageRender;
    function getArchiveModelCount() {
        if (!state.index?.conversations?.length) {
            return 0;
        }
        const models = new Set();
        for (const conversation of state.index.conversations) {
            for (const candidate of [conversation.modelSlug, conversation.defaultModelSlug]) {
                const normalized = typeof candidate === "string" ? candidate.trim() : "";
                if (normalized) {
                    models.add(normalized);
                }
            }
        }
        return models.size;
    }
    function needsFolderReattach() {
        return Boolean(state.cacheMode === "folder"
            && state.index?.images?.length
            && state.index.images.some((image) => !image.objectUrl));
    }
    function canOpenImagesWithoutHydration() {
        return Boolean(state.index?.images?.length
            || state.cacheMode === "folder");
    }
    function setActiveView(view) {
        if (state.pageType === "conversation") {
            state.activeView = "conversations";
        }
        else {
            state.activeView = view;
        }
        for (const button of elements.tabButtons) {
            const isActive = button.dataset.view === state.activeView;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        }
        elements.roleWrap.hidden = state.activeView !== "conversations";
        elements.modelWrap.hidden = state.activeView !== "conversations";
        elements.searchInput.placeholder = state.activeView === "images"
            ? "Search image filenames or paths"
            : "Search titles, messages, or both";
        elements.listTitle.textContent = state.activeView === "images" ? "Images" : "Conversations";
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
        elements.statResults.textContent = getArchiveModelCount().toLocaleString();
    }
    function renderActiveView() {
        const hasData = Boolean(state.index);
        elements.emptyState.hidden = hasData;
        const statsPanel = document.getElementById("stats");
        if (statsPanel) {
            statsPanel.hidden = !hasData || state.pageType !== "browser";
        }
        elements.browserView.hidden = !hasData || state.pageType !== "browser" || state.activeView !== "conversations";
        elements.conversationView.hidden = !hasData || state.pageType !== "conversation" || state.activeView !== "conversations";
        elements.imageView.hidden = !hasData || state.pageType === "conversation" || state.activeView !== "images";
        elements.reattachFolderBanner.hidden = !hasData || !needsFolderReattach() || state.pageType !== "browser";
        elements.imageReattachPrompt.hidden = !hasData || !needsFolderReattach() || state.pageType === "conversation" || state.activeView !== "images";
        if (!hasData) {
            elements.resultCaption.textContent = "No export loaded yet.";
            elements.conversationList.innerHTML = "";
            updateConversationListPager();
            return;
        }
        if (state.activeView === "images") {
            renderImagesView();
        }
        else {
            renderConversationsView();
        }
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
            const enabled = view !== "images" || canOpenImagesWithoutHydration();
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
        getConversationIdFromLocation,
        setSelectedConversation,
    };
})();
