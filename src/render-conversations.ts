(() => {
  window.ChatBrowser = window.ChatBrowser || {};

  const { CONVERSATION_LIST_PAGE_SIZE_OPTIONS, state, elements, saveUiState } = window.ChatBrowser.stateModule!;
  const { saveSessionHandoff } = window.ChatBrowser.storage!;
  const { getMessageAttachmentKey, resolveMessageImages } = window.ChatBrowser.attachments!;
  const { canLoadConversationDetails, loadConversationDetails } = window.ChatBrowser.parserClient!;
  const { formatDate, escapeHtml } = window.ChatBrowser.ui!;

  let loadingConversationDetailsId: string | null = null;
  const conversationDetailErrors = new Map<string, string>();
  const CONVERSATION_URL_PARAM = "conversation";
  const SESSION_URL_PARAM = "session";
  const CONVERSATION_PAGE_NAME = "conversation.html";

  function getConversationIdFromLocation(): string {
    try {
      const url = new URL(window.location.href);
      const conversationId = url.searchParams.get(CONVERSATION_URL_PARAM);
      return conversationId ? conversationId.trim() : "";
    } catch (error) {
      console.warn("Failed to read the conversation id from the URL:", error);
      return "";
    }
  }

  function getSessionKeyFromLocation(): string {
    try {
      const url = new URL(window.location.href);
      const sessionKey = url.searchParams.get(SESSION_URL_PARAM);
      return sessionKey ? sessionKey.trim() : "";
    } catch (error) {
      console.warn("Failed to read the session key from the URL:", error);
      return "";
    }
  }

  function buildUrlForConversation(conversationId: string | null): string {
    const url = state.pageType === "conversation"
      ? new URL(window.location.href)
      : new URL(`./${CONVERSATION_PAGE_NAME}`, window.location.href);
    if (conversationId) {
      url.searchParams.set(CONVERSATION_URL_PARAM, conversationId);
    } else {
      url.searchParams.delete(CONVERSATION_URL_PARAM);
    }
    if (state.currentSessionKey) {
      url.searchParams.set(SESSION_URL_PARAM, state.currentSessionKey);
    } else {
      url.searchParams.delete(SESSION_URL_PARAM);
    }
    return url.toString();
  }

  function syncConversationUrl(conversationId: string | null, mode: "replace" | "push" = "replace"): void {
    if (state.pageType !== "conversation") {
      return;
    }

    if (!window.history?.replaceState || !window.history?.pushState) {
      return;
    }

    const nextUrl = buildUrlForConversation(conversationId);
    if (nextUrl === window.location.href) {
      return;
    }

    const historyMode = mode === "push" ? "pushState" : "replaceState";
    window.history[historyMode]({ conversationId: conversationId || null }, "", nextUrl);
  }

  function setSelectedConversation(conversationId: string | null, options: HistoryModeOptions = {}): boolean {
    if (!conversationId) {
      state.selectedConversationId = null;
      if (options.history !== "ignore") {
        syncConversationUrl(null, options.history || "replace");
      }
      return false;
    }

    if (state.selectedConversationId === conversationId) {
      if (options.history === "replace") {
        syncConversationUrl(conversationId, "replace");
      }
      return false;
    }

    state.selectedConversationId = conversationId;
    if (options.history !== "ignore") {
      syncConversationUrl(conversationId, options.history || "replace");
    }
    return true;
  }

  function normalizeModelSlug(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function getConversationModelCandidates(conversation: ConversationRecord | null | undefined): string[] {
    const candidates: string[] = [];

    for (const value of [conversation?.modelSlug, conversation?.defaultModelSlug]) {
      const normalized = normalizeModelSlug(value);
      if (normalized && !candidates.includes(normalized)) {
        candidates.push(normalized);
      }
    }

    return candidates;
  }

  function formatConversationModel(conversation: ConversationRecord | null | undefined): string {
    const candidates = getConversationModelCandidates(conversation);
    if (!candidates.length) {
      return "Unknown model";
    }

    if (candidates.length === 1 || candidates[0] === candidates[1]) {
      return candidates[0];
    }

    return `${candidates[0]} (default ${candidates[1]})`;
  }

  function createModelOption(label: string, value: string): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function syncModelFilterOptions(): void {
    if (!state.index) {
      return;
    }

    const currentValue = state.modelFilter || "all";
    const modelValues = new Set<string>();
    let hasUnknown = false;

    for (const conversation of state.index.conversations) {
      const candidates = getConversationModelCandidates(conversation);
      if (!candidates.length) {
        hasUnknown = true;
        continue;
      }

      for (const candidate of candidates) {
        modelValues.add(candidate);
      }
    }

    const nextOptions = [createModelOption("All models", "all")];

    if (hasUnknown) {
      nextOptions.push(createModelOption("Unknown model", "unknown"));
    }

    for (const model of Array.from(modelValues).sort((a, b) => a.localeCompare(b))) {
      nextOptions.push(createModelOption(model, model));
    }

    elements.modelSelect.replaceChildren(...nextOptions);

    const optionValues = new Set(nextOptions.map((option) => option.value));
    state.modelFilter = optionValues.has(currentValue) ? currentValue : "all";
    elements.modelSelect.value = state.modelFilter;
  }

  function isReaderVisibleMessage(message: MessageRecord): boolean {
    return Boolean(message && message.role !== "tool");
  }

  function getRoleLabel(message: MessageRecord, conversation?: ConversationRecord | null): string {
    if (message.role === "assistant") {
      return (
        message.speakerModelSlug
        || message.speakerDefaultModelSlug
        || conversation?.modelSlug
        || conversation?.defaultModelSlug
        || message.authorName
        || "assistant"
      );
    }

    if (message.authorName) {
      return `${message.role} (${message.authorName})`;
    }
    return message.role;
  }

  function compareConversations(a: ConversationRecord, b: ConversationRecord, mode: string): number {
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

  function getConversationListPageCount(): number {
    return Math.max(1, Math.ceil(state.filteredConversations.length / state.conversationListPageSize));
  }

  function clampConversationListPage(): void {
    state.conversationListPage = Math.max(0, Math.min(state.conversationListPage, getConversationListPageCount() - 1));
  }

  function ensureSelectedConversationPage(): void {
    const selectedIndex = state.filteredConversations.findIndex(
      (conversation) => conversation.id === state.selectedConversationId,
    );

    if (selectedIndex === -1) {
      clampConversationListPage();
      return;
    }

    state.conversationListPage = Math.floor(selectedIndex / state.conversationListPageSize);
  }

  function updateConversationListPager(): void {
    const isVisible = state.activeView === "conversations" && state.filteredConversations.length > state.conversationListPageSize;
    const totalPages = getConversationListPageCount();
    const currentPage = state.conversationListPage + 1;
    const label = `${currentPage} of ${totalPages}`;
    const pageOptions = Array.from({ length: totalPages }, (_, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = String(index + 1);
      return option;
    });

    elements.listPagerTop.hidden = !isVisible;
    elements.listPagerBottom.hidden = !isVisible;
    elements.listPagePositionTop.textContent = label;
    elements.listPagePositionBottom.textContent = label;
    elements.listPageSizeTop.value = String(state.conversationListPageSize);
    elements.listPageSizeBottom.value = String(state.conversationListPageSize);
    elements.listPageInputTop.replaceChildren(...pageOptions.map((option) => option.cloneNode(true)));
    elements.listPageInputBottom.replaceChildren(...pageOptions);
    elements.listPageInputTop.value = String(currentPage);
    elements.listPageInputBottom.value = String(currentPage);

    const disablePrev = state.conversationListPage <= 0;
    const disableNext = state.conversationListPage >= totalPages - 1;

    elements.prevListPageTop.disabled = disablePrev;
    elements.prevListPageBottom.disabled = disablePrev;
    elements.nextListPageTop.disabled = disableNext;
    elements.nextListPageBottom.disabled = disableNext;
    elements.listPageInputTop.disabled = !isVisible;
    elements.listPageInputBottom.disabled = !isVisible;
  }

  function moveConversationListPage(direction: number): void {
    state.conversationListPage += direction;
    clampConversationListPage();

    const start = state.conversationListPage * state.conversationListPageSize;
    const nextConversation = state.filteredConversations[start];
    if (nextConversation) {
      setSelectedConversation(nextConversation.id, { history: "push" });
    }

    renderConversationsView();
  }

  function setConversationListPageSize(value: string): void {
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

  function jumpConversationListPage(value: string): void {
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
      setSelectedConversation(nextConversation.id, { history: "push" });
    }

    renderConversationsView();
  }

  function roleFilterMatches(conversation: ConversationRecord, role: string): boolean {
    if (role === "all") {
      return conversation.messages.some((message) => isReaderVisibleMessage(message));
    }
    return conversation.messages.some((message) => isReaderVisibleMessage(message) && message.role === role);
  }

  function modelFilterMatches(conversation: ConversationRecord, modelFilter: string): boolean {
    if (modelFilter === "all") {
      return true;
    }

    const candidates = getConversationModelCandidates(conversation);
    if (modelFilter === "unknown") {
      return candidates.length === 0;
    }

    return candidates.includes(modelFilter);
  }

  function searchMatchesConversation(conversation: ConversationRecord, query: string, role: string): boolean {
    if (!query) {
      return true;
    }

    const lowerQuery = query.toLowerCase();
    if (getConversationModelCandidates(conversation).some((candidate) => candidate.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    if (role === "all") {
      return conversation.searchBlob.includes(lowerQuery);
    }

    if (conversation.title.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    return conversation.messages.some(
      (message) => isReaderVisibleMessage(message) && message.role === role && message.text.toLowerCase().includes(lowerQuery),
    );
  }

  function getVisibleMessages(conversation: ConversationRecord): MessageRecord[] {
    const readerMessages = conversation.messages.filter((message) => isReaderVisibleMessage(message));
    const role = elements.roleSelect.value;
    if (role === "all") {
      return readerMessages;
    }
    return readerMessages.filter((message) => message.role === role);
  }

  function messageNeedsDetailHydration(message: MessageRecord): boolean {
    if (!message) {
      return false;
    }

    if (
      Object.prototype.hasOwnProperty.call(message, "rawContent")
      || Object.prototype.hasOwnProperty.call(message, "rawMetadata")
      || Object.prototype.hasOwnProperty.call(message, "contentType")
    ) {
      return false;
    }

    return !state.messageAssetMap.has(getMessageAttachmentKey(message));
  }

  function conversationNeedsDetailHydration(conversation: ConversationRecord | null): boolean {
    if (!conversation) {
      return false;
    }

    if (!state.rawConversationMap.has(conversation.id)) {
      return true;
    }

    return conversation.messages.some((message) => messageNeedsDetailHydration(message));
  }

  function replaceConversationRecord(nextConversation: ConversationRecord): void {
    if (!state.index) {
      return;
    }

    state.index.conversations = state.index.conversations.map((conversation) => (
      conversation.id === nextConversation.id ? nextConversation : conversation
    ));
    state.filteredConversations = state.filteredConversations.map((conversation) => (
      conversation.id === nextConversation.id ? nextConversation : conversation
    ));
  }

  async function loadSelectedConversationDetails(): Promise<void> {
    const conversation = state.index?.conversations.find(
      (item) => item.id === state.selectedConversationId,
    );

    if (!conversation || loadingConversationDetailsId === conversation.id) {
      return;
    }

    loadingConversationDetailsId = conversation.id;
    conversationDetailErrors.delete(conversation.id);
    renderConversation(conversation);

    try {
      const loaded = await loadConversationDetails(conversation.id);
      if (!loaded?.conversation) {
        throw new Error("Couldn't find that conversation in the selected backup source.");
      }

      replaceConversationRecord(loaded.conversation);
    } catch (error) {
      conversationDetailErrors.set(
        conversation.id,
        error instanceof Error ? error.message : "Failed to load full conversation details.",
      );
    } finally {
      loadingConversationDetailsId = null;
      renderConversationsView();
    }
  }

  function updateConversationDetailActions(conversation: ConversationRecord | null): void {
    if (!conversation) {
      elements.conversationDetailActions.hidden = true;
      elements.loadConversationDetails.disabled = false;
      elements.conversationDetailStatus.textContent = "";
      return;
    }

    const needsDetails = conversationNeedsDetailHydration(conversation);
    if (!needsDetails) {
      elements.conversationDetailActions.hidden = true;
      elements.loadConversationDetails.disabled = false;
      elements.conversationDetailStatus.textContent = "";
      return;
    }

    const isLoading = loadingConversationDetailsId === conversation.id;
    const canLoad = canLoadConversationDetails(conversation.id);
    const errorMessage = conversationDetailErrors.get(conversation.id) || "";

    elements.conversationDetailActions.hidden = false;
    elements.loadConversationDetails.disabled = isLoading || !canLoad;
    elements.loadConversationDetails.textContent = isLoading
      ? "Loading Full Conversation Details..."
      : "Load Full Conversation Details";

    if (isLoading) {
      elements.conversationDetailStatus.textContent = "Loading raw JSON and attachment data for this conversation...";
      return;
    }

    if (errorMessage) {
      elements.conversationDetailStatus.textContent = errorMessage;
      return;
    }

    elements.conversationDetailStatus.textContent = canLoad
      ? "Load raw JSON and attachment data for this conversation."
      : "Re-select the original backup file or folder to load raw JSON and attachments for this conversation.";
  }

  function renderConversation(conversation: ConversationRecord | null): void {
    if (state.pageType !== "conversation") {
      elements.conversationView.hidden = true;
      return;
    }

    if (!conversation) {
      elements.conversationView.hidden = true;
      elements.conversationDetailActions.hidden = true;
      elements.conversationRawDetails.open = false;
      elements.conversationRawOutput.textContent = "No conversation selected.";
      elements.conversationModel.textContent = "";
      updateConversationPager();
      updateConversationListPager();
      return;
    }

    const visibleMessages = getVisibleMessages(conversation);
    elements.conversationView.hidden = false;
    elements.conversationTitle.textContent = conversation.title;
    elements.conversationDates.textContent = `Created ${formatDate(conversation.createdAt)} | Updated ${formatDate(conversation.updatedAt)}`;
    elements.conversationModel.textContent = `Model ${formatConversationModel(conversation)}`;
    elements.conversationCount.textContent = `${visibleMessages.length} visible message${visibleMessages.length === 1 ? "" : "s"}`;
    updateConversationDetailActions(conversation);
    const rawConversation = state.rawConversationMap.get(conversation.id);
    elements.conversationRawOutput.textContent = rawConversation
      ? JSON.stringify(rawConversation, null, 2)
      : canLoadConversationDetails(conversation.id)
        ? "Raw conversation JSON is not loaded yet. Use Load Full Conversation Details to fetch it for this conversation."
        : "Raw conversation JSON is unavailable for this session. Re-select the original backup source to load it.";

    if (!visibleMessages.length) {
      elements.conversationMessages.innerHTML = '<div class="empty-note">This conversation exists, but nothing matches the current role filter.</div>';
      updateConversationPager();
      updateConversationListPager();
      saveUiState();
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
          <div class="message-author">${escapeHtml(getRoleLabel(message, conversation))}</div>
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
    updateConversationPager();
    updateConversationListPager();
    saveUiState();
  }

  function moveConversationSelection(direction: number): void {
    if (state.pageType !== "conversation") {
      return;
    }

    if (!state.filteredConversations.length) {
      return;
    }

    const currentIndex = state.filteredConversations.findIndex(
      (conversation) => conversation.id === state.selectedConversationId,
    );

    if (currentIndex === -1) {
      setSelectedConversation(state.filteredConversations[0].id, { history: "replace" });
      renderConversationsView();
      return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= state.filteredConversations.length) {
      return;
    }

    setSelectedConversation(state.filteredConversations[nextIndex].id, { history: "push" });
    ensureSelectedConversationPage();
    renderConversationsView();
  }

  function jumpToConversationIndex(index: number): void {
    if (state.pageType !== "conversation") {
      return;
    }

    if (!state.filteredConversations.length) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(index, state.filteredConversations.length - 1));
    const conversation = state.filteredConversations[clampedIndex];
    if (!conversation) {
      return;
    }

    setSelectedConversation(conversation.id, { history: "push" });
    ensureSelectedConversationPage();
    renderConversationsView();
  }

  function buildConversationPagerTokens(total: number, currentIndex: number): PagerToken[] {
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
    const tokens: PagerToken[] = [];

    orderedPages.forEach((pageIndex, index) => {
      if (index > 0 && pageIndex - orderedPages[index - 1] > 1) {
        tokens.push({ type: "ellipsis", key: `ellipsis-${orderedPages[index - 1]}-${pageIndex}` });
      }
      tokens.push({ type: "page", value: pageIndex, key: `page-${pageIndex}` });
    });

    return tokens;
  }

  function renderConversationPagerPicker(container: HTMLElement, total: number, currentIndex: number): void {
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
      button.textContent = String((token.value || 0) + 1);
      if (token.value === currentIndex) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => {
        jumpToConversationIndex(token.value || 0);
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

  function updateConversationPager(): void {
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

  function renderConversationsView(): void {
    const query = elements.searchInput.value.trim();
    const role = elements.roleSelect.value;
    const sort = elements.sortSelect.value;

    if (!state.index) {
      elements.conversationList.innerHTML = "";
      elements.resultCaption.textContent = "No export loaded yet.";
      state.conversationListPage = 0;
      updateConversationListPager();
      renderConversation(null);
      return;
    }

    syncModelFilterOptions();

    state.filteredConversations = state.index.conversations
      .filter((conversation) => roleFilterMatches(conversation, role))
      .filter((conversation) => modelFilterMatches(conversation, state.modelFilter))
      .filter((conversation) => searchMatchesConversation(conversation, query, role))
      .sort((a, b) => compareConversations(a, b, sort));

    elements.resultCaption.textContent = `${state.filteredConversations.length} matching conversation${state.filteredConversations.length === 1 ? "" : "s"}`;

    if (!state.filteredConversations.length) {
      elements.conversationList.innerHTML = '<div class="empty-note">No conversation matches. Try a different search, role filter, or model filter.</div>';
      state.conversationListPage = 0;
      setSelectedConversation(null, { history: "replace" });
      updateConversationListPager();
      renderConversation(null);
      return;
    }

    if (!state.filteredConversations.some((conversation) => conversation.id === state.selectedConversationId)) {
      setSelectedConversation(state.filteredConversations[0].id, { history: "replace" });
    } else {
      syncConversationUrl(state.selectedConversationId, "replace");
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
          <span>${escapeHtml(formatConversationModel(conversation))}</span>
        </div>
      `;

      button.addEventListener("click", () => {
        if (state.pageType === "browser") {
          if (state.index && state.currentSessionKey) {
            saveSessionHandoff({
              sessionKey: state.currentSessionKey,
              sourceMode: state.cacheMode === "folder" ? "folder" : "file",
              sourceLabel: state.index.source || "cached session",
              index: state.index,
            });
          }
          window.location.href = buildUrlForConversation(conversation.id);
          return;
        }

        setSelectedConversation(conversation.id, { history: "push" });
        ensureSelectedConversationPage();
        renderConversationsView();
      });

      return button;
    });

    elements.conversationList.replaceChildren(...buttons);
    updateConversationListPager();
    if (state.pageType === "conversation") {
      renderConversation(
        state.filteredConversations.find((conversation) => conversation.id === state.selectedConversationId) || null,
      );
    } else {
      renderConversation(null);
    }
  }

  window.ChatBrowser.conversationRender = {
    moveConversationListPage,
    setConversationListPageSize,
    jumpConversationListPage,
    updateConversationListPager,
    renderConversationsView,
    moveConversationSelection,
    loadSelectedConversationDetails,
    getConversationIdFromLocation,
    getSessionKeyFromLocation,
    setSelectedConversation,
  };
})();
