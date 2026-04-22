(() => {
  window.ChatBrowser = window.ChatBrowser || {};

  const { IMAGE_EXTENSIONS, state, elements } = window.ChatBrowser.stateModule!;
  const { setStatus, setProgress } = window.ChatBrowser.ui!;
  const shared = window.ChatBrowser.parserShared!;

  const pendingConversationDetailLoads = new Map<string, Promise<ConversationLoadResult | null>>();
  let conversationDetailSessionKey: string | null = null;

  function postLocalProgress(status: string, progress: number): void {
    setStatus(status);
    setProgress(progress, false);
  }

  function getSelectedConversationSourceFile(): File | null {
    if (state.attachedFolderFiles.length) {
      return state.attachedFolderFiles.find(
        (file) => (file.webkitRelativePath || file.name).endsWith("conversations.json"),
      ) || state.attachedFolderFiles.find(
        (file) => (file.webkitRelativePath || file.name).endsWith("chat.html"),
      ) || null;
    }

    if (elements.fileInput.files?.length) {
      return elements.fileInput.files[0];
    }

    if (elements.folderInput.files?.length) {
      return Array.from(elements.folderInput.files).find(
        (file) => (file.webkitRelativePath || file.name).endsWith("conversations.json"),
      ) || Array.from(elements.folderInput.files).find(
        (file) => (file.webkitRelativePath || file.name).endsWith("chat.html"),
      ) || null;
    }

    return null;
  }

  function canLoadConversationDetails(conversationId: string): boolean {
    return Boolean(
      conversationId
      && (
        state.rawConversationMap.has(conversationId)
        || getSelectedConversationSourceFile()
        || (
          state.cacheMode === "folder"
          && state.currentSessionKey
          && typeof (window as any).showDirectoryPicker === "function"
        )
      ),
    );
  }

  function resetConversationDetailLoadStateIfNeeded(): void {
    if (conversationDetailSessionKey === state.currentSessionKey) {
      return;
    }

    conversationDetailSessionKey = state.currentSessionKey;
    pendingConversationDetailLoads.clear();
  }

  async function loadConversationDetails(conversationId: string): Promise<ConversationLoadResult | null> {
    if (!conversationId) {
      return null;
    }

    const cachedRawConversation = state.rawConversationMap.get(conversationId);
    if (cachedRawConversation) {
      return {
        rawConversation: cachedRawConversation,
        conversation: shared.summarizeConversation(cachedRawConversation, 0),
      };
    }

    resetConversationDetailLoadStateIfNeeded();
    if (pendingConversationDetailLoads.has(conversationId)) {
      return pendingConversationDetailLoads.get(conversationId)!;
    }

    const pendingLoad = (async () => {
      let sourceFile = getSelectedConversationSourceFile();
      if (!sourceFile && state.cacheMode === "folder" && state.currentSessionKey) {
        const reconnected = await window.ChatBrowser.app?.reconnectCurrentFolderAccess({
          hydrateImages: false,
          promptIfNeeded: true,
          openPickerIfMissing: false,
        });
        if (reconnected) {
          sourceFile = getSelectedConversationSourceFile();
        }
      }

      if (!sourceFile) {
        return null;
      }

      const rawText = await sourceFile.text();
      const payload = shared.extractConversationArray(rawText);
      const rawData = JSON.parse(payload);
      if (!Array.isArray(rawData)) {
        throw new Error("Expected the export to contain a conversation array.");
      }

      const rawConversation = rawData.find((conversation: any) => {
        const rawConversationId = conversation?.conversation_id || conversation?.id || "";
        return rawConversationId === conversationId;
      }) || null;

      if (!rawConversation) {
        return null;
      }

      state.rawConversationMap.set(conversationId, rawConversation);
      return {
        rawConversation,
        conversation: shared.summarizeConversation(rawConversation, 0),
      };
    })();

    pendingConversationDetailLoads.set(conversationId, pendingLoad);

    try {
      return await pendingLoad;
    } finally {
      pendingConversationDetailLoads.delete(conversationId);
    }
  }

  async function parseConversationsLightweight(rawText: string): Promise<ParseConversationResult> {
    postLocalProgress("Extracting conversation payload...", 10);
    const payload = shared.extractConversationArray(rawText);

    postLocalProgress("Parsing conversation JSON...", 30);
    const rawData = JSON.parse(payload);
    if (!Array.isArray(rawData)) {
      throw new Error("Expected the export to contain a conversation array.");
    }

    postLocalProgress("Summarizing conversations in lightweight mode...", 45);
    const conversations: ConversationRecord[] = [];
    let totalMessages = 0;

    for (let index = 0; index < rawData.length; index += 1) {
      const conversation = rawData[index];
      const summary = shared.summarizeConversationLightweight(conversation, index);
      conversations.push(summary);
      totalMessages += summary.messageCount;

      if (index > 0 && index % 25 === 0) {
        const progress = Math.min(95, 45 + Math.round((index / rawData.length) * 50));
        postLocalProgress(
          `Summarizing conversations in lightweight mode... ${index.toLocaleString()} / ${rawData.length.toLocaleString()}`,
          progress,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return {
      conversations,
      totalMessages,
      rawConversationMap: new Map(),
      rawConversationEntriesOmitted: true,
    };
  }

  async function parseConversationsRobustLocally(rawText: string): Promise<ParseConversationResult> {
    postLocalProgress("Extracting conversation payload...", 10);
    const payload = shared.extractConversationArray(rawText);

    postLocalProgress("Parsing conversation JSON...", 30);
    const rawData = JSON.parse(payload);
    if (!Array.isArray(rawData)) {
      throw new Error("Expected the export to contain a conversation array.");
    }

    postLocalProgress("Parser worker crashed. Falling back to local robust parsing...", 40);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const conversations: ConversationRecord[] = [];
    const rawConversationEntries: [string, unknown][] = [];
    const maxRawConversationEntries = 150;
    let totalMessages = 0;

    for (let index = 0; index < rawData.length; index += 1) {
      const conversation = rawData[index];
      const summary = shared.summarizeConversation(conversation, index);
      conversations.push(summary);
      totalMessages += summary.messageCount;

      if (rawConversationEntries.length < maxRawConversationEntries) {
        rawConversationEntries.push([summary.id, conversation]);
      }

      if (index > 0 && index % 25 === 0) {
        const progress = Math.min(95, 45 + Math.round((index / rawData.length) * 50));
        postLocalProgress(
          `Falling back to local robust parsing... ${index.toLocaleString()} / ${rawData.length.toLocaleString()}`,
          progress,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return {
      conversations,
      totalMessages,
      rawConversationMap: new Map(rawConversationEntries),
      rawConversationEntriesOmitted: rawData.length > maxRawConversationEntries,
    };
  }

  function createInlineWorkerSource(): string {
    return `
importScripts(${JSON.stringify(new URL("./parser-shared.js", window.location.href).toString())});
(${(() => {
  self.addEventListener("message", (event: MessageEvent) => {
    const { type, rawText } = (event.data || {}) as { type?: string; rawText?: string };
    if (type !== "parse-conversations" || typeof rawText !== "string") {
      return;
    }

    const namespace = ((self as unknown as { ChatBrowser?: ChatBrowserNamespace }).ChatBrowser ||= {});
    const shared = namespace.parserShared!;

    try {
      self.postMessage({ type: "parse-progress", status: "Extracting conversation payload...", progress: 10 });
      const payload = shared.extractConversationArray(rawText);

      self.postMessage({ type: "parse-progress", status: "Parsing conversation JSON...", progress: 30 });
      const rawData = JSON.parse(payload);
      if (!Array.isArray(rawData)) {
        throw new Error("Expected the export to contain a conversation array.");
      }

      self.postMessage({ type: "parse-progress", status: "Summarizing conversations...", progress: 45 });
      const result = shared.buildConversationIndex(rawData, {
        onProgress(status: string, progress: number) {
          self.postMessage({ type: "parse-progress", status, progress });
        },
      });

      self.postMessage({
        type: "parse-complete",
        conversations: result.conversations,
        totalMessages: result.totalMessages,
        rawConversationEntries: result.rawConversationEntries,
        rawConversationEntriesOmitted: result.rawConversationEntriesOmitted,
      });
    } catch (error) {
      self.postMessage({
        type: "parse-error",
        message: error instanceof Error ? error.message : "Failed to parse export.",
      });
    }
  });
}).toString()})();
`;
  }

  function createParserWorker(): { worker: Worker; cleanupUrl(): void } {
    if (window.location.protocol === "file:") {
      const workerSource = createInlineWorkerSource();
      const blob = new Blob([workerSource], { type: "text/javascript" });
      const objectUrl = URL.createObjectURL(blob);
      const worker = new Worker(objectUrl);
      return {
        worker,
        cleanupUrl() {
          URL.revokeObjectURL(objectUrl);
        },
      };
    }

    return {
      worker: new Worker("./conversation-parser-worker.js"),
      cleanupUrl() {},
    };
  }

  function parseConversationsInWorker(rawText: string): Promise<ParseConversationResult> {
    if (state.parserMode === "lightweight") {
      return parseConversationsLightweight(rawText);
    }

    return new Promise((resolve, reject) => {
      const { worker, cleanupUrl } = createParserWorker();

      const cleanup = () => {
        worker.terminate();
        cleanupUrl();
      };

      worker.addEventListener("message", (event: MessageEvent) => {
        const message = (event.data || {}) as any;

        if (message.type === "parse-progress") {
          if (typeof message.status === "string") {
            setStatus(message.status);
          }
          if (typeof message.progress === "number") {
            setProgress(message.progress, false);
          }
          return;
        }

        if (message.type === "parse-complete") {
          cleanup();
          resolve({
            conversations: Array.isArray(message.conversations) ? message.conversations : [],
            totalMessages: Number.isFinite(message.totalMessages) ? message.totalMessages : 0,
            rawConversationMap: new Map(Array.isArray(message.rawConversationEntries) ? message.rawConversationEntries : []),
            rawConversationEntriesOmitted: Boolean(message.rawConversationEntriesOmitted),
          });
          return;
        }

        if (message.type === "parse-error") {
          cleanup();
          reject(new Error(message.message || "Failed to parse export."));
        }
      });

      worker.addEventListener("error", (event) => {
        cleanup();
        void parseConversationsRobustLocally(rawText)
          .then(resolve)
          .catch((fallbackError) => {
            reject(fallbackError || event.error || new Error("The parser worker crashed."));
          });
      });

      worker.postMessage({
        type: "parse-conversations",
        rawText,
      });
    });
  }

  function extensionForFile(file: File): string {
    const name = file.name || "";
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex === -1) {
      return "";
    }
    return name.slice(dotIndex + 1).toLowerCase();
  }

  function buildImagesIndex(files: File[]): ImageRecord[] {
    const images: ImageRecord[] = [];

    files.forEach((file) => {
      const extension = extensionForFile(file);
      if (!IMAGE_EXTENSIONS.has(extension)) {
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      state.objectUrls.push(objectUrl);

      const relativePath = file.webkitRelativePath || file.name;
      images.push({
        id: `image-${encodeURIComponent(relativePath)}-${file.size}-${file.lastModified || 0}`,
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

  async function buildBackupIndex({ conversations, images, source }: BuildBackupIndexOptions): Promise<ArchiveIndex> {
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
      messageAssetMap: new Map(),
      rawConversationMap: new Map(),
    };
  }

  window.ChatBrowser.parserClient = {
    parseConversationsInWorker,
    buildImagesIndex,
    buildBackupIndex,
    canLoadConversationDetails,
    loadConversationDetails,
  };
})();
