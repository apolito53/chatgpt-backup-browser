"use strict";
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const { state, elements, saveUiState, loadUiState, applyUiState, setSourceMode } = window.ChatBrowser.stateModule;
    const { setStatus, setProgress, renderChangelog, setChangelogOpen, confirmAction } = window.ChatBrowser.ui;
    const { buildFileFingerprint, buildSessionKey, saveSessionRecord, loadRecentSessionRecords, loadSessionRecord, loadLatestSessionRecord, saveIndex, loadSavedIndex, revokeObjectUrls, } = window.ChatBrowser.storage;
    const { parseConversationsInWorker, buildImagesIndex, buildBackupIndex } = window.ChatBrowser.parserClient;
    const { moveConversationListPage, setConversationListPageSize, jumpConversationListPage, setActiveView, updateStats, renderActiveView, applyIndex, moveConversationSelection, loadSelectedConversationDetails, getConversationIdFromLocation, setSelectedConversation, } = window.ChatBrowser.render;
    if (state.pageType === "conversation") {
        elements.tabButtons.forEach((button) => {
            button.hidden = true;
        });
    }
    function updateFolderDigestButton() {
        const hasFolderSelection = Boolean(elements.folderInput.files && elements.folderInput.files.length);
        elements.digestFolderButton.disabled = !hasFolderSelection;
    }
    function hasLoadedArchive() {
        return Boolean(state.index && (state.index.conversations.length || state.index.images.length));
    }
    function formatRecentArchiveTimestamp(timestamp) {
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
            return "Saved sometime mysterious";
        }
        return new Date(timestamp).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
        });
    }
    function buildRestoreStatusMessage(sessionRecord) {
        return sessionRecord.sourceMode === "folder"
            ? `Restored cached folder index for ${sessionRecord.sourceLabel}. Re-select the backup folder to reattach live image previews.`
            : `Restored cached session for ${sessionRecord.sourceLabel}.`;
    }
    function applyStoredSession(sessionRecord) {
        state.cacheMode = sessionRecord.sourceMode === "folder" ? "folder" : "single-file";
        state.currentSessionKey = sessionRecord.sessionKey;
        revokeObjectUrls();
        applyIndex(sessionRecord.index, buildRestoreStatusMessage(sessionRecord));
    }
    async function refreshRecentArchives() {
        try {
            const recentSessions = await loadRecentSessionRecords(6);
            elements.recentArchivesList.textContent = "";
            if (!recentSessions.length) {
                elements.recentArchivesPanel.hidden = true;
                return;
            }
            elements.recentArchivesPanel.hidden = false;
            for (const session of recentSessions) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "ghost-button recent-archive-button";
                button.dataset.sessionKey = session.sessionKey;
                button.disabled = session.sessionKey === state.currentSessionKey;
                const titleRow = document.createElement("span");
                titleRow.className = "recent-archive-title-row";
                const title = document.createElement("span");
                title.textContent = session.sourceLabel || "Cached archive";
                titleRow.append(title);
                const tag = document.createElement("span");
                tag.className = "recent-archive-tag";
                tag.textContent = session.sessionKey === state.currentSessionKey
                    ? "Current"
                    : session.sourceMode === "folder"
                        ? "Folder"
                        : "File";
                titleRow.append(tag);
                const meta = document.createElement("span");
                meta.className = "recent-archive-meta";
                meta.textContent = `${session.stats.conversations} convos | ${session.stats.images} images | ${formatRecentArchiveTimestamp(session.savedAt)}`;
                button.append(titleRow, meta);
                elements.recentArchivesList.append(button);
            }
        }
        catch (error) {
            console.warn("Failed to refresh recent archives:", error);
            elements.recentArchivesPanel.hidden = true;
        }
    }
    async function confirmArchiveReplacement(nextSourceLabel) {
        if (!hasLoadedArchive()) {
            return true;
        }
        return confirmAction({
            title: "Switch to this backup?",
            message: `This will swap the archive currently shown in the viewer for ${nextSourceLabel}. It does not delete your saved session cache. It only changes what this tab is showing right now.`,
            acceptLabel: "Switch to New Backup",
            cancelLabel: "Stay on Current Backup",
        });
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
            const conversationData = await parseConversationsInWorker(rawText);
            const index = await buildBackupIndex({
                conversations: conversationData.conversations,
                images: [],
                source: file.name,
            });
            index.rawConversationMap = conversationData.rawConversationMap;
            saveIndex(index);
            applyIndex(index, conversationData.rawConversationEntriesOmitted
                ? state.parserMode === "lightweight"
                    ? `Loaded ${file.name} in lightweight mode. Raw conversation JSON and inline attachment metadata were skipped to keep the browser responsive.`
                    : `Loaded ${file.name}. Raw conversation JSON was trimmed for this large archive so the parser worker doesn't fall over.`
                : `Loaded ${file.name}.`);
            saveSessionRecord({
                sessionKey: state.currentSessionKey,
                sourceMode: "file",
                sourceLabel: file.name,
                index,
            }).catch((error) => {
                console.warn("Failed to persist single-file session:", error);
            });
            refreshRecentArchives().catch((error) => {
                console.warn("Failed to refresh recent archives after single-file parse:", error);
            });
        }
        catch (error) {
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
            const conversationData = await parseConversationsInWorker(rawText);
            setStatus("Indexing images...");
            setProgress(70, false);
            const images = buildImagesIndex(files);
            const rootSegment = (conversationFile.webkitRelativePath || "").split("/")[0] || "backup folder";
            state.currentSessionKey = buildSessionKey({
                sourceMode: "folder",
                sourceName: rootSegment,
                fingerprint: [buildFileFingerprint(conversationFile), files.length].join(":"),
            });
            const index = await buildBackupIndex({
                conversations: conversationData.conversations,
                images,
                source: rootSegment,
            });
            index.rawConversationMap = conversationData.rawConversationMap;
            applyIndex(index, conversationData.rawConversationEntriesOmitted
                ? state.parserMode === "lightweight"
                    ? `Loaded folder ${rootSegment} in lightweight mode. Raw conversation JSON and inline attachment metadata were skipped to keep the browser responsive. Folder sessions are kept in this tab only.`
                    : `Loaded folder ${rootSegment}. Raw conversation JSON was trimmed for this large archive so the parser worker stays upright. Folder sessions are kept in this tab only.`
                : `Loaded folder ${rootSegment}. Folder sessions are kept in this tab only.`);
            saveSessionRecord({
                sessionKey: state.currentSessionKey,
                sourceMode: "folder",
                sourceLabel: rootSegment,
                index,
            }).catch((error) => {
                console.warn("Failed to persist folder session:", error);
            });
            refreshRecentArchives().catch((error) => {
                console.warn("Failed to refresh recent archives after folder parse:", error);
            });
        }
        catch (error) {
            console.error(error);
            setStatus(error instanceof Error ? error.message : "Failed to parse backup folder.");
            setProgress(0, true);
        }
    }
    async function restoreFromPickerOrCache() {
        if (elements.folderInput.files && elements.folderInput.files.length) {
            updateFolderDigestButton();
            setSourceMode("folder");
            state.cacheMode = "folder";
            setStatus("Folder selected. Choose a parser mode and click Digest Selected Folder.");
            setProgress(0, true);
            return;
        }
        if (elements.fileInput.files && elements.fileInput.files.length) {
            await parseSingleFile(elements.fileInput.files[0]);
            return;
        }
        try {
            const storedSession = await loadLatestSessionRecord();
            if (storedSession) {
                applyStoredSession(storedSession);
                refreshRecentArchives().catch((error) => {
                    console.warn("Failed to refresh recent archives after restore:", error);
                });
                return;
            }
            const cached = loadSavedIndex();
            if (cached) {
                applyIndex(cached, "Restored last single-file session from browser storage.");
            }
            else {
                updateStats();
                const imagesButton = elements.tabButtons.find((button) => button.dataset.view === "images");
                if (imagesButton) {
                    imagesButton.disabled = true;
                }
            }
        }
        catch (error) {
            console.error(error);
            setStatus("Saved session restore failed. Reload the original backup source to refresh the cache.");
            setProgress(0, true);
        }
    }
    elements.fileInput.addEventListener("change", async (event) => {
        const input = event.target;
        const [file] = input.files || [];
        if (!file) {
            return;
        }
        const confirmed = await confirmArchiveReplacement(file.name || "this file");
        if (!confirmed) {
            elements.fileInput.value = "";
            setStatus("Kept the current archive.");
            return;
        }
        void parseSingleFile(file);
    });
    elements.folderInput.addEventListener("change", async (event) => {
        const input = event.target;
        const files = input.files || [];
        if (!files.length) {
            updateFolderDigestButton();
            return;
        }
        const folderLabel = files[0]?.webkitRelativePath?.split("/")[0] || "that backup folder";
        const confirmed = await confirmArchiveReplacement(folderLabel);
        if (!confirmed) {
            elements.folderInput.value = "";
            updateFolderDigestButton();
            setStatus("Kept the current archive.");
            return;
        }
        updateFolderDigestButton();
        setSourceMode("folder");
        state.cacheMode = "folder";
        setStatus("Folder selected. Choose a parser mode and click Digest Selected Folder.");
        setProgress(0, true);
    });
    elements.recentArchivesList.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-session-key]");
        if (!button) {
            return;
        }
        const sessionKey = button.dataset.sessionKey;
        if (!sessionKey || sessionKey === state.currentSessionKey) {
            return;
        }
        try {
            const storedSession = await loadSessionRecord(sessionKey);
            if (!storedSession) {
                setStatus("That cached archive is no longer available. Re-load the backup and I'll cache it again.");
                await refreshRecentArchives();
                return;
            }
            applyStoredSession(storedSession);
            await refreshRecentArchives();
        }
        catch (error) {
            console.error(error);
            setStatus("Couldn't restore that cached archive. Re-load the source and I'll rebuild it.");
            setProgress(0, true);
        }
    });
    elements.loadConversationDetails.addEventListener("click", () => {
        void loadSelectedConversationDetails();
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
    elements.modelSelect.addEventListener("change", () => {
        state.modelFilter = elements.modelSelect.value || "all";
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
    elements.listPageInputTop.addEventListener("change", () => {
        jumpConversationListPage(elements.listPageInputTop.value);
    });
    elements.listPageInputBottom.addEventListener("change", () => {
        jumpConversationListPage(elements.listPageInputBottom.value);
    });
    elements.parserModeSelect.addEventListener("change", (event) => {
        state.parserMode = event.target.value === "lightweight" ? "lightweight" : "robust";
        saveUiState();
        updateFolderDigestButton();
    });
    elements.digestFolderButton.addEventListener("click", () => {
        const files = elements.folderInput.files || [];
        if (!files.length) {
            setStatus("Select a backup folder first.");
            return;
        }
        void parseFolder(files);
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
        if (event.key === "Escape" && !elements.confirmModal.hidden) {
            elements.confirmCancel.click();
            return;
        }
        if (event.key === "Escape" && !elements.changelogModal.hidden) {
            setChangelogOpen(false);
        }
    });
    const uiState = loadUiState();
    if (uiState) {
        applyUiState(uiState);
    }
    else {
        setSourceMode("folder");
    }
    const conversationIdFromUrl = getConversationIdFromLocation();
    if (conversationIdFromUrl) {
        state.selectedConversationId = conversationIdFromUrl;
    }
    updateFolderDigestButton();
    renderChangelog();
    void refreshRecentArchives();
    void restoreFromPickerOrCache();
    window.addEventListener("popstate", () => {
        if (state.pageType !== "conversation") {
            return;
        }
        if (!state.index?.conversations?.length) {
            return;
        }
        const conversationId = getConversationIdFromLocation();
        if (!conversationId) {
            const fallbackConversationId = state.filteredConversations[0]?.id || state.index.conversations[0]?.id || null;
            setSelectedConversation(fallbackConversationId, { history: "ignore" });
        }
        else if (state.index.conversations.some((conversation) => conversation.id === conversationId)) {
            setSelectedConversation(conversationId, { history: "ignore" });
        }
        else {
            return;
        }
        state.activeView = "conversations";
        renderActiveView();
        saveUiState();
    });
})();
