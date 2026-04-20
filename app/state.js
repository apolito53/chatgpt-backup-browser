"use strict";
// @ts-check
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const query = (selector) => {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Missing required element: ${selector}`);
        }
        return element;
    };
    const queryOptional = (selector) => document.querySelector(selector);
    const STORAGE_KEY = "chatgpt-backup-browser:index";
    const UI_STATE_KEY = "chatgpt-backup-browser:ui-state";
    const ARCHIVE_DB_NAME = "chatgpt-backup-browser";
    const ARCHIVE_DB_VERSION = 2;
    const ARCHIVE_SESSION_STORE = "sessions";
    const ARCHIVE_HANDLE_STORE = "folderHandles";
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
        attachedFolderFiles: [],
        cacheMode: "single-file",
        sourceMode: "folder",
        conversationListPage: 0,
        conversationListPageSize: DEFAULT_CONVERSATION_LIST_PAGE_SIZE,
        modelFilter: "all",
        rawConversationMap: new Map(),
        messageAssetMap: new Map(),
        currentSessionKey: null,
        parserMode: "robust",
        pageType: document.body.dataset.page === "conversation" ? "conversation" : "browser",
        browserControlsCollapsed: false,
    };
    const elements = {
        fileInput: query("#file-input"),
        folderInput: query("#folder-input"),
        sourceTabButtons: Array.from(document.querySelectorAll("[data-source]")),
        folderSourcePanel: query("#folder-source-panel"),
        fileSourcePanel: query("#file-source-panel"),
        folderAccessButton: query("#folder-access-button"),
        folderAccessStatus: query("#folder-access-status"),
        parserModeSelect: query("#parser-mode-select"),
        digestFolderButton: query("#digest-folder"),
        recentArchivesPanel: query("#recent-archives-panel"),
        recentArchivesList: query("#recent-archives-list"),
        searchInput: query("#search-input"),
        sortSelect: query("#sort-select"),
        roleWrap: query("#role-filter-wrap"),
        roleSelect: query("#role-select"),
        modelWrap: query("#model-filter-wrap"),
        modelSelect: query("#model-select"),
        status: query("#status"),
        statusBanner: query("#status-banner"),
        progress: query("#progress"),
        tabButtons: Array.from(document.querySelectorAll("[data-view]")),
        listTitle: query("#list-title"),
        conversationList: query("#conversation-list"),
        listPagerTop: query("#list-pager-top"),
        listPagerBottom: query("#list-pager-bottom"),
        prevListPageTop: query("#prev-list-page-top"),
        nextListPageTop: query("#next-list-page-top"),
        prevListPageBottom: query("#prev-list-page-bottom"),
        nextListPageBottom: query("#next-list-page-bottom"),
        listPagePositionTop: query("#list-page-position-top"),
        listPagePositionBottom: query("#list-page-position-bottom"),
        listPageSizeTop: query("#list-page-size-top"),
        listPageSizeBottom: query("#list-page-size-bottom"),
        listPageInputTop: query("#list-page-input-top"),
        listPageInputBottom: query("#list-page-input-bottom"),
        resultCaption: query("#result-caption"),
        browserView: query("#browser-view"),
        browserControls: queryOptional("#browser-controls"),
        browserControlsBody: queryOptional("#browser-controls-body"),
        browserControlsToggle: queryOptional("#browser-controls-toggle"),
        reattachFolderBanner: query("#reattach-folder-banner"),
        reattachFolderButton: query("#reattach-folder-button"),
        statConversations: query("#stat-conversations"),
        statMessages: query("#stat-messages"),
        statImages: query("#stat-images"),
        statResults: query("#stat-results"),
        emptyState: query("#empty-state"),
        conversationView: query("#conversation-view"),
        conversationTitle: query("#conversation-title"),
        conversationDates: query("#conversation-dates"),
        conversationCount: query("#conversation-count"),
        conversationModel: query("#conversation-model"),
        conversationMessages: query("#conversation-messages"),
        conversationDetailActions: query("#conversation-detail-actions"),
        loadConversationDetails: query("#load-conversation-details"),
        conversationDetailStatus: query("#conversation-detail-status"),
        conversationRawDetails: query("#conversation-raw-details"),
        conversationRawOutput: query("#conversation-raw-output"),
        prevConversationTop: query("#prev-conversation-top"),
        nextConversationTop: query("#next-conversation-top"),
        prevConversationBottom: query("#prev-conversation-bottom"),
        nextConversationBottom: query("#next-conversation-bottom"),
        conversationPositionTop: query("#conversation-position-top"),
        conversationPositionBottom: query("#conversation-position-bottom"),
        imageView: query("#image-view"),
        imageCount: query("#image-count"),
        imageReattachPrompt: query("#image-reattach-prompt"),
        imageReattachButton: query("#image-reattach-button"),
        imageGrid: query("#image-grid"),
        imagePreview: query("#image-preview"),
        imagePreviewName: query("#image-preview-name"),
        imagePreviewMeta: query("#image-preview-meta"),
        imagePreviewPath: query("#image-preview-path"),
        appVersion: query("#app-version"),
        openChangelog: query("#open-changelog"),
        closeChangelog: query("#close-changelog"),
        changelogModal: query("#changelog-modal"),
        changelogList: query("#changelog-list"),
        changelogCloseTargets: Array.from(document.querySelectorAll("[data-close-changelog]")),
        confirmModal: query("#confirm-modal"),
        confirmBackdrop: query("#confirm-backdrop"),
        confirmTitle: query("#confirm-title"),
        confirmMessage: query("#confirm-message"),
        confirmCancelTop: query("#confirm-cancel-top"),
        confirmCancel: query("#confirm-cancel"),
        confirmAccept: query("#confirm-accept"),
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
            modelFilter: state.modelFilter,
            browserControlsCollapsed: state.browserControlsCollapsed,
            parserMode: state.parserMode,
        };
        try {
            sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(payload));
        }
        catch (error) {
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
        }
        catch (error) {
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
        if (Number.isInteger(uiState.conversationListPageSize)
            && CONVERSATION_LIST_PAGE_SIZE_OPTIONS.has(uiState.conversationListPageSize)) {
            state.conversationListPageSize = uiState.conversationListPageSize;
        }
        if (uiState.activeView === "images" || uiState.activeView === "conversations") {
            state.activeView = uiState.activeView;
        }
        if (uiState.sourceMode === "file" || uiState.sourceMode === "folder") {
            setSourceMode(uiState.sourceMode);
        }
        if (typeof uiState.modelFilter === "string") {
            state.modelFilter = uiState.modelFilter;
        }
        if (typeof uiState.browserControlsCollapsed === "boolean") {
            state.browserControlsCollapsed = uiState.browserControlsCollapsed;
        }
        if (uiState.parserMode === "lightweight" || uiState.parserMode === "robust") {
            state.parserMode = uiState.parserMode;
        }
        elements.listPageSizeTop.value = String(state.conversationListPageSize);
        elements.listPageSizeBottom.value = String(state.conversationListPageSize);
        elements.modelSelect.value = state.modelFilter;
        elements.parserModeSelect.value = state.parserMode;
    }
    window.ChatBrowser.stateModule = {
        STORAGE_KEY,
        UI_STATE_KEY,
        ARCHIVE_DB_NAME,
        ARCHIVE_DB_VERSION,
        ARCHIVE_SESSION_STORE,
        ARCHIVE_HANDLE_STORE,
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
