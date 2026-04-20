// @ts-check

(() => {
window.ChatBrowser = window.ChatBrowser || {};

const { APP_VERSION, CHANGELOG_ENTRIES } = window.ChatBrowser.changelog!;
const { elements } = window.ChatBrowser.stateModule!;

function setStatus(message: string): void {
  elements.status.textContent = message;
}

function setProgress(value: number, hidden = false): void {
  elements.progress.hidden = hidden;
  if (!hidden) {
    elements.progress.value = value;
  }
}

function formatDate(timestamp?: number | null): string {
  if (!timestamp) {
    return "Unknown date";
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes && bytes !== 0) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderChangelog(): void {
  elements.appVersion.textContent = `v${APP_VERSION}`;

  const cards = CHANGELOG_ENTRIES.map((entry) => {
    const article = document.createElement("article");
    article.className = "changelog-entry";

    const changes = entry.changes
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");

    article.innerHTML = `
      <div class="changelog-entry-header">
        <h3>v${escapeHtml(entry.version)}</h3>
        <span class="changelog-entry-date">${escapeHtml(entry.date)}</span>
      </div>
      <ul>${changes}</ul>
    `;

    return article;
  });

  elements.changelogList.replaceChildren(...cards);
}

function setChangelogOpen(isOpen: boolean): void {
  elements.changelogModal.hidden = !isOpen;
  document.body.classList.toggle("modal-open", isOpen);
}

window.ChatBrowser.ui = {
  setStatus,
  setProgress,
  formatDate,
  formatFileSize,
  escapeHtml,
  renderChangelog,
  setChangelogOpen,
};
})();
