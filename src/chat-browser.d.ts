type ActiveView = "conversations" | "images";
type SourceMode = "folder" | "file";
type CacheMode = "single-file" | "folder";

interface MessageRecord {
  id: string;
  role: string;
  text: string;
  createTime?: number | null;
  updateTime?: number | null;
  authorName?: string | null;
}

interface ConversationRecord {
  id: string;
  title: string;
  createdAt?: number | null;
  updatedAt?: number | null;
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

interface ArchiveIndex {
  conversations: ConversationRecord[];
  images: ImageRecord[];
  stats: ArchiveStats;
  rawConversationMap: Map<string, unknown>;
  messageAssetMap: Map<string, unknown[]>;
}

interface AppState {
  index: ArchiveIndex | null;
  filteredConversations: ConversationRecord[];
  filteredImages: ImageRecord[];
  selectedConversationId: string | null;
  selectedImageId: string | null;
  activeView: ActiveView;
  objectUrls: string[];
  cacheMode: CacheMode;
  sourceMode: SourceMode;
  conversationListPage: number;
  conversationListPageSize: number;
  rawConversationMap: Map<string, unknown>;
  messageAssetMap: Map<string, unknown[]>;
  currentSessionKey: string | null;
}

interface ElementsRegistry {
  fileInput: HTMLInputElement;
  folderInput: HTMLInputElement;
  sourceTabButtons: HTMLButtonElement[];
  folderSourcePanel: HTMLElement;
  fileSourcePanel: HTMLElement;
  loadSample: HTMLButtonElement;
  searchInput: HTMLInputElement;
  sortSelect: HTMLSelectElement;
  roleWrap: HTMLElement;
  roleSelect: HTMLSelectElement;
  status: HTMLElement;
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
  listPageJumpTop: HTMLFormElement;
  listPageJumpBottom: HTMLFormElement;
  listPageInputTop: HTMLInputElement;
  listPageInputBottom: HTMLInputElement;
  resultCaption: HTMLElement;
  statConversations: HTMLElement;
  statMessages: HTMLElement;
  statImages: HTMLElement;
  statResults: HTMLElement;
  emptyState: HTMLElement;
  conversationView: HTMLElement;
  conversationTitle: HTMLElement;
  conversationDates: HTMLElement;
  conversationCount: HTMLElement;
  conversationMessages: HTMLElement;
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
}

interface StateModule {
  STORAGE_KEY: string;
  UI_STATE_KEY: string;
  ARCHIVE_DB_NAME: string;
  ARCHIVE_DB_VERSION: number;
  ARCHIVE_SESSION_STORE: string;
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
}

interface ChatBrowserNamespace {
  changelog?: ChangelogModule;
  stateModule?: StateModule;
  ui?: UiModule;
  storage?: any;
  attachments?: any;
  parserClient?: any;
  conversationRender?: any;
  imageRender?: any;
  render?: any;
}

interface Window {
  ChatBrowser: ChatBrowserNamespace;
}
