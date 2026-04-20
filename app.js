// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const { state, elements, saveUiState, loadUiState, applyUiState, setSourceMode } = window.ChatBrowser.stateModule;
const { setStatus, setProgress, renderChangelog, setChangelogOpen } = window.ChatBrowser.ui;
const {
  buildFileFingerprint,
  buildSessionKey,
  saveSessionRecord,
  loadLatestSessionRecord,
  saveIndex,
  loadSavedIndex,
  revokeObjectUrls,
} = window.ChatBrowser.storage;
const { parseConversationsInWorker, buildImagesIndex, buildBackupIndex } = window.ChatBrowser.parserClient;
const {
  moveConversationListPage,
  setConversationListPageSize,
  jumpConversationListPage,
  setActiveView,
  updateStats,
  renderActiveView,
  applyIndex,
  moveConversationSelection,
} = window.ChatBrowser.render;

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
    const index = buildBackupIndex({
      conversations: conversationData.conversations,
      images: [],
      source: file.name,
    });
    index.rawConversationMap = conversationData.rawConversationMap;

    saveIndex(index);
    applyIndex(
      index,
      conversationData.rawConversationEntriesOmitted
        ? `Loaded ${file.name}. Raw conversation JSON was trimmed for this large archive so the parser worker doesn't fall over.`
        : `Loaded ${file.name}.`,
    );
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

    const index = buildBackupIndex({
      conversations: conversationData.conversations,
      images,
      source: rootSegment,
    });
    index.rawConversationMap = conversationData.rawConversationMap;

    applyIndex(
      index,
      conversationData.rawConversationEntriesOmitted
        ? `Loaded folder ${rootSegment}. Raw conversation JSON was trimmed for this large archive so the parser worker stays upright. Folder sessions are kept in this tab only.`
        : `Loaded folder ${rootSegment}. Folder sessions are kept in this tab only.`,
    );
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

elements.parserModeSelect.addEventListener("change", (event) => {
  state.parserMode = event.target.value === "lightweight" ? "lightweight" : "robust";
  saveUiState();
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
restoreFromPickerOrCache();
})();
