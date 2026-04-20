"use strict";
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const { state, elements, saveUiState, loadUiState, applyUiState, setSourceMode } = window.ChatBrowser.stateModule;
    const { setStatus, setProgress, renderChangelog, setChangelogOpen, confirmAction } = window.ChatBrowser.ui;
    const { buildFileFingerprint, buildSessionKey, saveSessionRecord, loadRecentSessionRecords, loadSessionRecord, loadLatestSessionRecord, loadSessionHandoff, saveFolderHandleRecord, loadFolderHandleRecord, saveIndex, loadSavedIndex, revokeObjectUrls, } = window.ChatBrowser.storage;
    const { parseConversationsInWorker, buildImagesIndex, buildBackupIndex } = window.ChatBrowser.parserClient;
    const { moveConversationListPage, setConversationListPageSize, jumpConversationListPage, setActiveView, setBrowserControlsCollapsed, updateStats, renderActiveView, applyIndex, moveConversationSelection, loadSelectedConversationDetails, getConversationIdFromLocation, getSessionKeyFromLocation, setSelectedConversation, } = window.ChatBrowser.render;
    if (state.pageType === "conversation") {
        elements.tabButtons.forEach((button) => {
            button.hidden = true;
        });
    }
    function updateFolderDigestButton() {
        const hasFolderSelection = Boolean((elements.folderInput.files && elements.folderInput.files.length)
            || state.attachedFolderFiles.length);
        elements.digestFolderButton.disabled = !hasFolderSelection;
    }
    function browserSupportsDirectoryAccess() {
        return typeof window.showDirectoryPicker === "function";
    }
    function browserIsFirefox() {
        const userAgent = typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
        return /firefox/i.test(userAgent) && !/seamonkey/i.test(userAgent);
    }
    function canRestoreFolderSessionsFromCache() {
        return browserSupportsDirectoryAccess();
    }
    function getManualFolderReloadMessage(sourceLabel) {
        return browserIsFirefox()
            ? `Firefox cannot reopen cached folder indexes by itself yet. Select the ${sourceLabel} backup folder again, then digest it to reload the archive.`
            : `This browser cannot reopen cached folder indexes by itself. Select the ${sourceLabel} backup folder again, then digest it to reload the archive.`;
    }
    function updateReattachMessaging() {
        const reattachCopy = elements.reattachFolderBanner.querySelector("p");
        const reattachTitle = elements.reattachFolderBanner.querySelector("strong");
        const imageReattachCopy = elements.imageReattachPrompt?.querySelector("p") || null;
        const imageReattachTitle = elements.imageReattachPrompt?.querySelector("strong") || null;
        const supportsDirectoryAccess = browserSupportsDirectoryAccess();
        elements.reattachFolderButton.textContent = supportsDirectoryAccess
            ? "Reconnect Backup Folder"
            : "Select Backup Folder Again";
        if (elements.imageReattachButton) {
            elements.imageReattachButton.textContent = supportsDirectoryAccess
                ? "Reconnect Backup Folder"
                : "Select Backup Folder Again";
        }
        if (reattachTitle) {
            reattachTitle.textContent = supportsDirectoryAccess
                ? "Live folder access is disconnected."
                : "This browser cannot keep live folder access.";
        }
        if (reattachCopy) {
            reattachCopy.textContent = supportsDirectoryAccess
                ? "Cached conversations are here, but previews and inline attachments need the original backup folder."
                : "Cached conversations are here, but this browser still needs you to select the backup folder again before previews and inline attachments can load.";
        }
        if (imageReattachTitle) {
            imageReattachTitle.textContent = supportsDirectoryAccess
                ? "Image previews need the original folder."
                : "This browser needs the folder selected again.";
        }
        if (imageReattachCopy) {
            imageReattachCopy.textContent = supportsDirectoryAccess
                ? "The archive index is restored, but the browser needs you to reattach the backup folder before it can show the actual files again."
                : "The archive index is restored, but this browser cannot remember folder access between sessions, so you need to select the backup folder again before the actual image files can load.";
        }
    }
    function promptFolderReattach() {
        setSourceMode("folder");
        if (browserSupportsDirectoryAccess()) {
            void reconnectCurrentFolderAccess({ promptIfNeeded: true });
            return;
        }
        elements.folderInput.click();
    }
    function assignRelativePath(file, relativePath) {
        try {
            Object.defineProperty(file, "webkitRelativePath", {
                value: relativePath,
                configurable: true,
            });
        }
        catch (error) {
            console.warn("Failed to assign relative path to file:", error);
        }
        return file;
    }
    async function collectFilesFromDirectoryHandle(handle, prefix = handle.name) {
        const files = [];
        for await (const entry of handle.values()) {
            if (entry.kind === "file") {
                const file = await entry.getFile();
                files.push(assignRelativePath(file, `${prefix}/${entry.name}`));
                continue;
            }
            if (entry.kind === "directory") {
                files.push(...await collectFilesFromDirectoryHandle(entry, `${prefix}/${entry.name}`));
            }
        }
        return files;
    }
    async function ensureDirectoryPermission(handle) {
        if (!handle?.queryPermission || !handle?.requestPermission) {
            return true;
        }
        const options = { mode: "read" };
        const currentPermission = await handle.queryPermission(options);
        if (currentPermission === "granted") {
            return true;
        }
        const requestedPermission = await handle.requestPermission(options);
        return requestedPermission === "granted";
    }
    async function hasDirectoryPermission(handle) {
        if (!handle?.queryPermission) {
            return true;
        }
        return (await handle.queryPermission({ mode: "read" })) === "granted";
    }
    async function updateFolderAccessControls() {
        if (!browserSupportsDirectoryAccess()) {
            elements.folderAccessButton.hidden = true;
            elements.folderAccessStatus.hidden = false;
            elements.folderAccessStatus.textContent = browserIsFirefox()
                ? "Firefox note: saved folder reconnect is not supported here yet, so you will still need to select the backup folder again each session."
                : "This browser does not support saved folder reconnects, so you will need to select the backup folder again when you want live previews and lazy details.";
            return;
        }
        elements.folderAccessButton.hidden = false;
        elements.folderAccessStatus.hidden = false;
        const sessionKey = state.currentSessionKey;
        if (!sessionKey) {
            elements.folderAccessButton.textContent = "Grant Folder Access";
            elements.folderAccessStatus.textContent = "Use the browser's folder permission flow so reconnecting later can be a one-click thing.";
            return;
        }
        const record = await loadFolderHandleRecord(sessionKey);
        if (record) {
            elements.folderAccessButton.textContent = state.attachedFolderFiles.length
                ? "Refresh Saved Folder"
                : "Reconnect Saved Folder";
            elements.folderAccessStatus.textContent = state.attachedFolderFiles.length
                ? `Live folder access is attached for ${record.sourceLabel || "this backup"}. If anything looks stale, refresh it from here.`
                : `Saved access is available for ${record.sourceLabel || "this backup"}. Click once to reconnect without browsing again.`;
            return;
        }
        elements.folderAccessButton.textContent = "Grant Folder Access";
        elements.folderAccessStatus.textContent = "Grant directory access once and later reconnects can use a permission prompt instead of manual browsing.";
    }
    async function connectDirectoryHandle(handle) {
        const hasPermission = await ensureDirectoryPermission(handle);
        if (!hasPermission) {
            throw new Error("Folder access was not granted.");
        }
        const files = await collectFilesFromDirectoryHandle(handle);
        state.attachedFolderFiles = files;
        updateFolderDigestButton();
        return files;
    }
    async function reconnectCurrentFolderAccess(options = {}) {
        if (!browserSupportsDirectoryAccess()) {
            return false;
        }
        const { hydrateImages = state.cacheMode === "folder" && state.parserMode !== "lightweight", promptIfNeeded = false } = options;
        const sessionKey = state.currentSessionKey;
        if (!sessionKey) {
            if (promptIfNeeded) {
                await chooseFolderWithDirectoryAccess();
            }
            return false;
        }
        const record = await loadFolderHandleRecord(sessionKey);
        if (!record?.handle) {
            if (promptIfNeeded) {
                await chooseFolderWithDirectoryAccess();
            }
            return false;
        }
        try {
            const canRead = promptIfNeeded
                ? await ensureDirectoryPermission(record.handle)
                : await hasDirectoryPermission(record.handle);
            if (!canRead) {
                return false;
            }
            const files = await connectDirectoryHandle(record.handle);
            if (state.index && state.cacheMode === "folder" && hydrateImages) {
                await attachImagesToCurrentFolderSession(files);
                setStatus(`Reconnected saved folder access for ${record.sourceLabel}.`);
                setProgress(0, true);
            }
            else if (state.index && state.cacheMode === "folder") {
                setStatus(`Reconnected saved folder access for ${record.sourceLabel}. Image previews can stay lazy until you open them.`);
                setProgress(0, true);
            }
            await updateFolderAccessControls();
            return true;
        }
        catch (error) {
            console.warn("Saved folder reconnect failed:", error);
            if (promptIfNeeded) {
                await chooseFolderWithDirectoryAccess();
            }
            return false;
        }
    }
    async function chooseFolderWithDirectoryAccess() {
        if (!browserSupportsDirectoryAccess()) {
            elements.folderInput.click();
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({
                mode: "read",
            });
            const files = await connectDirectoryHandle(handle);
            const { rootSegment, sessionKey } = getFolderSessionInfo(files);
            if (sessionKey) {
                await saveFolderHandleRecord({
                    sessionKey,
                    sourceLabel: rootSegment,
                    handle,
                });
            }
            await handleFolderSelection(files, { handle });
            await updateFolderAccessControls();
        }
        catch (error) {
            if (error?.name === "AbortError") {
                return;
            }
            console.error(error);
            setStatus(error instanceof Error ? error.message : "Couldn't open that folder.");
            setProgress(0, true);
        }
    }
    function getFolderSessionInfo(fileList) {
        const files = Array.from(fileList || []);
        const conversationFile = files.find((file) => (file.webkitRelativePath || file.name).endsWith("conversations.json"))
            || files.find((file) => (file.webkitRelativePath || file.name).endsWith("chat.html"))
            || null;
        if (!conversationFile) {
            return {
                files,
                conversationFile: null,
                rootSegment: "",
                sessionKey: null,
            };
        }
        const rootSegment = (conversationFile.webkitRelativePath || "").split("/")[0] || "backup folder";
        const sessionKey = buildSessionKey({
            sourceMode: "folder",
            sourceName: rootSegment,
            fingerprint: [buildFileFingerprint(conversationFile), files.length].join(":"),
        });
        return {
            files,
            conversationFile,
            rootSegment,
            sessionKey,
        };
    }
    function shouldHydrateLightweightImages() {
        return Boolean(state.cacheMode === "folder"
            && state.parserMode === "lightweight"
            && state.index
            && !state.index.images.length);
    }
    async function attachImagesToCurrentFolderSession(fileList) {
        const { files, sessionKey, rootSegment } = getFolderSessionInfo(fileList);
        if (!files.length || !state.index) {
            setStatus("Re-select the original backup folder first.");
            setProgress(0, true);
            return false;
        }
        if (!sessionKey || sessionKey !== state.currentSessionKey) {
            setStatus("That folder does not match the archive currently loaded here. Digest it as a new backup instead.");
            setProgress(0, true);
            return false;
        }
        revokeObjectUrls();
        setStatus(`Attaching image previews for ${rootSegment}...`);
        setProgress(75, false);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const images = buildImagesIndex(files);
        const nextIndex = {
            ...state.index,
            images,
            stats: {
                conversations: state.index.stats.conversations,
                messages: state.index.stats.messages,
                images: images.length,
            },
        };
        applyIndex(nextIndex, `Attached live image previews for ${rootSegment}.`);
        await saveSessionRecord({
            sessionKey: state.currentSessionKey,
            sourceMode: "folder",
            sourceLabel: rootSegment,
            index: nextIndex,
        });
        await refreshRecentArchives();
        return true;
    }
    async function ensureImagesReadyForLightweightMode() {
        if (!shouldHydrateLightweightImages()) {
            return true;
        }
        const confirmed = await confirmAction({
            title: "Build the image browser now?",
            message: "Lightweight mode skipped image attachment work on the first pass. Opening Images will attach the backup folder's image files now and may take a moment.",
            acceptLabel: "Build Images",
            cancelLabel: "Stay in Conversations",
        });
        if (!confirmed) {
            setStatus("Kept the lightweight conversation view.");
            return false;
        }
        try {
            if (!state.attachedFolderFiles.length) {
                const reconnected = await reconnectCurrentFolderAccess();
                if (!reconnected || !state.attachedFolderFiles.length) {
                    setStatus("Lightweight mode skipped image attachment work. Reconnect the original backup folder, then open Images again and I'll build the previews.");
                    return false;
                }
            }
            return await attachImagesToCurrentFolderSession(state.attachedFolderFiles);
        }
        catch (error) {
            console.error(error);
            setStatus(error instanceof Error ? error.message : "Failed to attach image previews.");
            setProgress(0, true);
            return false;
        }
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
            ? browserSupportsDirectoryAccess()
                ? `Restored cached folder index for ${sessionRecord.sourceLabel}. If the browser did not keep live folder access, use the folder controls in the sidebar to reconnect image previews and lazy details.`
                : `Restored cached folder index for ${sessionRecord.sourceLabel}. This browser cannot retain folder access, so you still need to select the backup folder again before image previews and lazy details can load.`
            : `Restored cached session for ${sessionRecord.sourceLabel}.`;
    }
    function applyStoredSession(sessionRecord) {
        state.cacheMode = sessionRecord.sourceMode === "folder" ? "folder" : "single-file";
        state.currentSessionKey = sessionRecord.sessionKey;
        state.attachedFolderFiles = [];
        setSourceMode(sessionRecord.sourceMode);
        revokeObjectUrls();
        applyIndex(sessionRecord.index, buildRestoreStatusMessage(sessionRecord));
        updateFolderDigestButton();
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
                    : session.sourceMode === "folder" && !canRestoreFolderSessionsFromCache()
                        ? "Folder / Re-select"
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
        state.attachedFolderFiles = [];
        state.cacheMode = "single-file";
        state.currentSessionKey = buildSessionKey({
            sourceMode: "file",
            sourceName: file.name,
            fingerprint: buildFileFingerprint(file),
        });
        revokeObjectUrls();
        updateFolderDigestButton();
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
            updateFolderAccessControls().catch((handleError) => {
                console.warn("Failed to refresh folder access controls after single-file parse:", handleError);
            });
        }
        catch (error) {
            console.error(error);
            setStatus(error instanceof Error ? error.message : "Failed to parse export.");
            setProgress(0, true);
        }
    }
    async function parseFolder(fileList, options = {}) {
        const { files, conversationFile, rootSegment, sessionKey } = getFolderSessionInfo(fileList);
        if (!files.length) {
            return;
        }
        setSourceMode("folder");
        state.cacheMode = "folder";
        revokeObjectUrls();
        setStatus("Scanning backup folder...");
        setProgress(10, false);
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
            const shouldBuildImages = state.parserMode !== "lightweight" || options.forceImages;
            setStatus(shouldBuildImages ? "Indexing images..." : "Skipping image attachment work for lightweight mode...");
            setProgress(70, false);
            const images = shouldBuildImages ? buildImagesIndex(files) : [];
            state.attachedFolderFiles = files;
            state.currentSessionKey = sessionKey;
            const index = await buildBackupIndex({
                conversations: conversationData.conversations,
                images,
                source: rootSegment,
            });
            index.rawConversationMap = conversationData.rawConversationMap;
            applyIndex(index, conversationData.rawConversationEntriesOmitted
                ? state.parserMode === "lightweight"
                    ? shouldBuildImages
                        ? `Loaded folder ${rootSegment} in lightweight mode and attached image previews on demand.`
                        : `Loaded folder ${rootSegment} in lightweight mode. Raw conversation JSON, inline attachment metadata, and image previews were skipped to keep the browser responsive. Open Images later if you want me to attach them.`
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
            updateFolderAccessControls().catch((handleError) => {
                console.warn("Failed to refresh folder access controls after folder parse:", handleError);
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
            const preferredSessionKey = getSessionKeyFromLocation();
            const storedSession = preferredSessionKey
                ? loadSessionHandoff(preferredSessionKey)
                    || (await loadSessionRecord(preferredSessionKey))
                    || await loadLatestSessionRecord()
                : await loadLatestSessionRecord();
            if (storedSession) {
                if (storedSession.sourceMode === "folder" && !canRestoreFolderSessionsFromCache()) {
                    setSourceMode("folder");
                    state.cacheMode = "folder";
                    state.currentSessionKey = null;
                    state.attachedFolderFiles = [];
                    updateFolderDigestButton();
                    setStatus(getManualFolderReloadMessage(storedSession.sourceLabel));
                    setProgress(0, true);
                    await refreshRecentArchives();
                }
                else {
                    applyStoredSession(storedSession);
                    if (storedSession.sourceMode === "folder") {
                        const restoredAccess = await reconnectCurrentFolderAccess({
                            hydrateImages: state.parserMode !== "lightweight",
                            promptIfNeeded: false,
                        });
                        if (!restoredAccess) {
                            setStatus(buildRestoreStatusMessage(storedSession));
                        }
                    }
                    updateFolderAccessControls().catch((handleError) => {
                        console.warn("Failed to refresh folder access controls after restore:", handleError);
                    });
                    refreshRecentArchives().catch((error) => {
                        console.warn("Failed to refresh recent archives after restore:", error);
                    });
                    return;
                }
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
    async function handleFolderSelection(fileList, options = {}) {
        const files = Array.from(fileList || []);
        if (!files.length) {
            updateFolderDigestButton();
            return;
        }
        state.attachedFolderFiles = files;
        const { rootSegment: folderLabel, sessionKey } = getFolderSessionInfo(files);
        const isCurrentSessionFolder = Boolean(sessionKey && sessionKey === state.currentSessionKey);
        if (options.handle && sessionKey) {
            await saveFolderHandleRecord({
                sessionKey,
                sourceLabel: folderLabel,
                handle: options.handle,
            });
        }
        if (isCurrentSessionFolder) {
            updateFolderDigestButton();
            setSourceMode("folder");
            state.cacheMode = "folder";
            if (state.parserMode === "lightweight") {
                setStatus("Original folder reattached. Open Images when you're ready and I'll attach the previews then.");
                setProgress(0, true);
                return;
            }
            if (state.index) {
                try {
                    const attached = await attachImagesToCurrentFolderSession(files);
                    if (!attached) {
                        setStatus("Reattached the folder, but couldn't refresh live previews from it.");
                    }
                }
                catch (error) {
                    console.error(error);
                    setStatus(error instanceof Error ? error.message : "Failed to reattach the current backup folder.");
                    setProgress(0, true);
                }
                return;
            }
            void parseFolder(files);
            return;
        }
        const confirmed = await confirmArchiveReplacement(folderLabel);
        if (!confirmed) {
            elements.folderInput.value = "";
            state.attachedFolderFiles = [];
            updateFolderDigestButton();
            setStatus("Kept the current archive.");
            return;
        }
        updateFolderDigestButton();
        setSourceMode("folder");
        state.cacheMode = "folder";
        setStatus("Folder selected. Choose a parser mode and click Digest Selected Folder.");
        setProgress(0, true);
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
        await handleFolderSelection(files);
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
            if (storedSession.sourceMode === "folder" && !canRestoreFolderSessionsFromCache()) {
                setSourceMode("folder");
                state.cacheMode = "folder";
                state.currentSessionKey = null;
                state.attachedFolderFiles = [];
                updateFolderDigestButton();
                setStatus(getManualFolderReloadMessage(storedSession.sourceLabel));
                setProgress(0, true);
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
    elements.browserControlsToggle?.addEventListener("click", () => {
        setBrowserControlsCollapsed(!state.browserControlsCollapsed);
        saveUiState();
    });
    elements.digestFolderButton.addEventListener("click", () => {
        const files = (elements.folderInput.files && elements.folderInput.files.length)
            ? elements.folderInput.files
            : state.attachedFolderFiles;
        if (!files.length) {
            setStatus("Select a backup folder first.");
            return;
        }
        void parseFolder(files);
    });
    elements.reattachFolderButton.addEventListener("click", () => {
        promptFolderReattach();
    });
    elements.imageReattachButton?.addEventListener("click", () => {
        promptFolderReattach();
    });
    elements.folderAccessButton.addEventListener("click", () => {
        void reconnectCurrentFolderAccess({ promptIfNeeded: true });
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
        button.addEventListener("click", async () => {
            if (button.disabled) {
                return;
            }
            if (button.dataset.view === "images") {
                const ready = await ensureImagesReadyForLightweightMode();
                if (!ready) {
                    return;
                }
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
    setBrowserControlsCollapsed(state.browserControlsCollapsed);
    const conversationIdFromUrl = getConversationIdFromLocation();
    if (conversationIdFromUrl) {
        state.selectedConversationId = conversationIdFromUrl;
    }
    updateFolderDigestButton();
    updateReattachMessaging();
    void updateFolderAccessControls();
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
