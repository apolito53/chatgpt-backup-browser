type ActiveView = "conversations" | "images";
type SourceMode = "folder" | "file";
type CacheMode = "single-file" | "folder";
type ParserMode = "lightweight" | "robust";
type PageType = "browser" | "conversation";

interface MessageRecord {
  id: string;
  conversationId?: string;
  role: string;
  text: string;
  createTime?: number | null;
  updateTime?: number | null;
  authorName?: string | null;
  speakerModelSlug?: string | null;
  speakerDefaultModelSlug?: string | null;
  rawContent?: unknown;
  rawMetadata?: unknown;
  contentType?: string | null;
}

interface ConversationRecord {
  id: string;
  title: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  modelSlug?: string | null;
  defaultModelSlug?: string | null;
  preview: string;
  searchBlob: string;
  messageCount: number;
  messages: MessageRecord[];
}

interface ImageRecord {
  id: string;
  name: string;
  relativePath: string;
  searchBlob: string;
  size: number;
  lastModified: number;
  objectUrl?: string;
}

interface ArchiveStats {
  conversations: number;
  messages: number;
  images: number;
}

interface SessionRecordSummary {
  sessionKey: string;
  sourceMode: SourceMode;
  sourceLabel: string;
  savedAt: number;
  stats: ArchiveStats;
}

interface FolderHandleRecord {
  sessionKey: string;
  sourceLabel: string;
  savedAt: number;
  handle: unknown;
}

interface ArchiveIndex {
  loadedAt?: number;
  source?: string;
  conversations: ConversationRecord[];
  images: ImageRecord[];
  stats: ArchiveStats;
  rawConversationMap: Map<string, unknown>;
  messageAssetMap: Map<string, MessageAttachmentRecord[]>;
}

interface AppState {
  index: ArchiveIndex | null;
  filteredConversations: ConversationRecord[];
  filteredImages: ImageRecord[];
  selectedConversationId: string | null;
  selectedImageId: string | null;
  activeView: ActiveView;
  objectUrls: string[];
  attachedFolderFiles: File[];
  cacheMode: CacheMode;
  sourceMode: SourceMode;
  conversationListPage: number;
  conversationListPageSize: number;
  modelFilter: string;
  rawConversationMap: Map<string, unknown>;
  messageAssetMap: Map<string, MessageAttachmentRecord[]>;
  currentSessionKey: string | null;
  parserMode: ParserMode;
  pageType: PageType;
  browserControlsCollapsed: boolean;
}

interface MessageAttachmentRecord {
  imageId: string;
  candidate?: string;
  referenceSource?: string;
  reference: unknown;
}

interface MessageImageResolution {
  image: ImageRecord;
  reference: unknown;
}

interface SessionRecord extends SessionRecordSummary {
  index: ArchiveIndex;
}

interface ConfirmActionOptions {
  title?: string;
  message?: string;
  acceptLabel?: string;
  cancelLabel?: string;
}

interface SessionKeyOptions {
  sourceMode: SourceMode;
  sourceName: string;
  fingerprint: string;
}

interface BuildBackupIndexOptions {
  conversations: ConversationRecord[];
  images: ImageRecord[];
  source: string;
}

interface ConversationLoadResult {
  rawConversation: unknown;
  conversation: ConversationRecord;
}

interface ParseConversationResult {
  conversations: ConversationRecord[];
  totalMessages: number;
  rawConversationMap: Map<string, unknown>;
  rawConversationEntriesOmitted: boolean;
}

interface ParseProgressPayload {
  processedMessages: number;
  totalMessages: number;
  progress: number;
}

interface IncrementalAttachmentOptions {
  chunkSize?: number;
  onProgress?(payload: ParseProgressPayload): void;
}

interface HistoryModeOptions {
  history?: "replace" | "push" | "ignore";
}

interface PagerToken {
  type: "ellipsis" | "page";
  key: string;
  value?: number;
}

interface ElementsRegistry {
  fileInput: HTMLInputElement;
  folderInput: HTMLInputElement;
  sourceTabButtons: HTMLButtonElement[];
  folderSourcePanel: HTMLElement;
  fileSourcePanel: HTMLElement;
  folderAccessButton: HTMLButtonElement;
  folderAccessStatus: HTMLElement;
  parserModeSelect: HTMLSelectElement;
  digestFolderButton: HTMLButtonElement;
  recentArchivesPanel: HTMLElement;
  recentArchivesList: HTMLElement;
  searchInput: HTMLInputElement;
  sortSelect: HTMLSelectElement;
  roleWrap: HTMLElement;
  roleSelect: HTMLSelectElement;
  modelWrap: HTMLElement;
  modelSelect: HTMLSelectElement;
  status: HTMLElement;
  statusBanner: HTMLElement;
  progress: HTMLProgressElement;
  tabButtons: HTMLButtonElement[];
  listTitle: HTMLElement;
  conversationList: HTMLElement;
  listPagerTop: HTMLElement;
  listPagerBottom: HTMLElement;
  prevListPageTop: HTMLButtonElement;
  nextListPageTop: HTMLButtonElement;
  prevListPageBottom: HTMLButtonElement;
  nextListPageBottom: HTMLButtonElement;
  listPagePositionTop: HTMLElement;
  listPagePositionBottom: HTMLElement;
  listPageSizeTop: HTMLSelectElement;
  listPageSizeBottom: HTMLSelectElement;
  listPageInputTop: HTMLSelectElement;
  listPageInputBottom: HTMLSelectElement;
  resultCaption: HTMLElement;
  browserView: HTMLElement;
  browserControls: HTMLElement | null;
  browserControlsBody: HTMLElement | null;
  browserControlsToggle: HTMLButtonElement | null;
  reattachFolderBanner: HTMLElement;
  reattachFolderButton: HTMLButtonElement;
  statConversations: HTMLElement;
  statMessages: HTMLElement;
  statImages: HTMLElement;
  statResults: HTMLElement;
  emptyState: HTMLElement;
  conversationView: HTMLElement;
  conversationTitle: HTMLElement;
  conversationDates: HTMLElement;
  conversationCount: HTMLElement;
  conversationModel: HTMLElement;
  conversationMessages: HTMLElement;
  conversationDetailActions: HTMLElement;
  loadConversationDetails: HTMLButtonElement;
  conversationDetailStatus: HTMLElement;
  conversationRawDetails: HTMLDetailsElement;
  conversationRawOutput: HTMLElement;
  prevConversationTop: HTMLButtonElement;
  nextConversationTop: HTMLButtonElement;
  prevConversationBottom: HTMLButtonElement;
  nextConversationBottom: HTMLButtonElement;
  conversationPositionTop: HTMLElement;
  conversationPositionBottom: HTMLElement;
  imageView: HTMLElement;
  imageCount: HTMLElement;
  imageReattachPrompt: HTMLElement | null;
  imageReattachButton: HTMLButtonElement | null;
  imageGrid: HTMLElement;
  imagePreview: HTMLElement;
  imagePreviewName: HTMLElement;
  imagePreviewMeta: HTMLElement;
  imagePreviewPath: HTMLElement;
  appVersion: HTMLElement;
  openChangelog: HTMLButtonElement;
  closeChangelog: HTMLButtonElement;
  changelogModal: HTMLElement;
  changelogList: HTMLElement;
  changelogCloseTargets: HTMLElement[];
  confirmModal: HTMLElement;
  confirmBackdrop: HTMLElement;
  confirmTitle: HTMLElement;
  confirmMessage: HTMLElement;
  confirmCancelTop: HTMLButtonElement;
  confirmCancel: HTMLButtonElement;
  confirmAccept: HTMLButtonElement;
}

interface UiStatePayload {
  activeView: ActiveView;
  selectedConversationId: string | null;
  selectedImageId: string | null;
  search: string;
  sort: string;
  role: string;
  sourceMode: SourceMode;
  conversationListPage: number;
  conversationListPageSize: number;
  modelFilter: string;
  browserControlsCollapsed?: boolean;
  parserMode: ParserMode;
}

interface StateModule {
  STORAGE_KEY: string;
  UI_STATE_KEY: string;
  ARCHIVE_DB_NAME: string;
  ARCHIVE_DB_VERSION: number;
  ARCHIVE_SESSION_STORE: string;
  ARCHIVE_HANDLE_STORE: string;
  HIDDEN_MESSAGE_FLAGS: string[];
  DEFAULT_CONVERSATION_LIST_PAGE_SIZE: number;
  CONVERSATION_LIST_PAGE_SIZE_OPTIONS: Set<number>;
  IMAGE_EXTENSIONS: Set<string>;
  state: AppState;
  elements: ElementsRegistry;
  saveUiState(): void;
  loadUiState(): UiStatePayload | null;
  setSourceMode(mode: SourceMode): void;
  applyUiState(uiState: UiStatePayload | null): void;
}

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

interface ChangelogModule {
  APP_VERSION: string;
  CHANGELOG_ENTRIES: ChangelogEntry[];
}

interface UiModule {
  setStatus(message: string): void;
  setProgress(value: number, hidden?: boolean): void;
  formatDate(timestamp?: number | null): string;
  formatFileSize(bytes?: number | null): string;
  escapeHtml(value: string): string;
  renderChangelog(): void;
  setChangelogOpen(isOpen: boolean): void;
  confirmAction(options?: ConfirmActionOptions): Promise<boolean>;
}

interface StorageModule {
  buildFileFingerprint(file: File): string;
  buildSessionKey(options: SessionKeyOptions): string;
  normalizeIndex(index: unknown): ArchiveIndex | null;
  saveSessionRecord(record: {
    sessionKey: string;
    sourceMode: SourceMode;
    sourceLabel: string;
    index: ArchiveIndex;
  }): Promise<void>;
  loadRecentSessionRecords(limit?: number): Promise<SessionRecordSummary[]>;
  loadSessionRecord(sessionKey: string): Promise<SessionRecord | null>;
  loadLatestSessionRecord(): Promise<SessionRecord | null>;
  saveFolderHandleRecord(record: { sessionKey: string; sourceLabel: string; handle: unknown }): Promise<void>;
  loadFolderHandleRecord(sessionKey: string): Promise<FolderHandleRecord | null>;
  saveSessionHandoff(record: { sessionKey: string; sourceMode: SourceMode; sourceLabel: string; index: ArchiveIndex }): void;
  loadSessionHandoff(sessionKey: string): SessionRecord | null;
  saveIndex(index: ArchiveIndex): void;
  loadSavedIndex(): ArchiveIndex | null;
  revokeObjectUrls(): void;
}

interface AttachmentsModule {
  getMessageAttachmentKey(message: MessageRecord): string;
  collectImageReferenceCandidates(value: unknown, found?: string[]): string[];
  hasStructuredMessageContent(message: unknown): boolean;
  extractPointerKey(candidate: unknown): string;
  buildMessageAssetMap(conversations: ConversationRecord[], images: ImageRecord[]): Map<string, MessageAttachmentRecord[]>;
  buildMessageAssetMapIncremental(
    conversations: ConversationRecord[],
    images: ImageRecord[],
    options?: IncrementalAttachmentOptions,
  ): Promise<Map<string, MessageAttachmentRecord[]>>;
  resolveMessageImages(message: MessageRecord): MessageImageResolution[];
}

interface ParserSharedModule {
  extractConversationArray(rawText: string): string;
  coerceTextParts(content: unknown): string;
  collectImageReferenceCandidates(value: unknown, found?: string[]): string[];
  hasStructuredMessageContent(message: unknown): boolean;
  normalizeModelSlug(value: unknown): string;
  getConversationModelInfo(conversation: any): { modelSlug: string; defaultModelSlug: string };
  getMessageModelInfo(
    message: any,
    conversationModelInfo?: { modelSlug?: string; defaultModelSlug?: string },
  ): { speakerModelSlug: string; speakerDefaultModelSlug: string };
  isVisibleMessage(message: any): boolean;
  lineageForConversation(conversation: any): string[];
  summarizeConversation(conversation: any, index: number): ConversationRecord;
  summarizeConversationLightweight(conversation: any, index: number): ConversationRecord;
  buildConversationIndex(rawData: any[], options?: { onProgress?(status: string, progress: number): void }): {
    conversations: ConversationRecord[];
    totalMessages: number;
    rawConversationEntries: [string, unknown][];
    rawConversationEntriesOmitted: boolean;
  };
}

interface ParserClientModule {
  parseConversationsInWorker(rawText: string): Promise<ParseConversationResult>;
  buildImagesIndex(files: File[]): ImageRecord[];
  buildBackupIndex(options: BuildBackupIndexOptions): Promise<ArchiveIndex>;
  canLoadConversationDetails(conversationId: string): boolean;
  loadConversationDetails(conversationId: string): Promise<ConversationLoadResult | null>;
}

interface ConversationRenderModule {
  moveConversationListPage(direction: number): void;
  setConversationListPageSize(value: string): void;
  jumpConversationListPage(value: string): void;
  updateConversationListPager(): void;
  renderConversationsView(): void;
  moveConversationSelection(direction: number): void;
  loadSelectedConversationDetails(): Promise<void>;
  getConversationIdFromLocation(): string;
  getSessionKeyFromLocation(): string;
  setSelectedConversation(conversationId: string | null, options?: HistoryModeOptions): boolean;
}

interface ImageRenderModule {
  renderImagesView(): void;
}

interface RenderModule {
  moveConversationListPage(direction: number): void;
  setConversationListPageSize(value: string): void;
  jumpConversationListPage(value: string): void;
  setActiveView(view: ActiveView): void;
  setBrowserControlsCollapsed(collapsed: boolean): void;
  updateStats(): void;
  renderActiveView(): void;
  applyIndex(index: unknown, sourceLabel: string): void;
  moveConversationSelection(direction: number): void;
  loadSelectedConversationDetails(): Promise<void>;
  getConversationIdFromLocation(): string;
  getSessionKeyFromLocation(): string;
  setSelectedConversation(conversationId: string | null, options?: HistoryModeOptions): boolean;
}

interface ChatBrowserNamespace {
  changelog?: ChangelogModule;
  stateModule?: StateModule;
  ui?: UiModule;
  storage?: StorageModule;
  attachments?: AttachmentsModule;
  parserShared?: ParserSharedModule;
  parserClient?: ParserClientModule;
  conversationRender?: ConversationRenderModule;
  imageRender?: ImageRenderModule;
  render?: RenderModule;
}

interface Window {
  ChatBrowser: ChatBrowserNamespace;
}
