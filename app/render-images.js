"use strict";
(() => {
    window.ChatBrowser = window.ChatBrowser || {};
    const { state, elements, saveUiState } = window.ChatBrowser.stateModule;
    const { formatFileSize, escapeHtml } = window.ChatBrowser.ui;
    const { updateConversationListPager } = window.ChatBrowser.conversationRender;
    function compareImages(a, b, mode) {
        switch (mode) {
            case "created-desc":
            case "updated-desc":
                return (b.lastModified || 0) - (a.lastModified || 0);
            case "updated-asc":
            case "created-asc":
                return (a.lastModified || 0) - (b.lastModified || 0);
            case "title-asc":
                return a.name.localeCompare(b.name);
            case "message-count-desc":
                return b.size - a.size;
            default:
                return a.relativePath.localeCompare(b.relativePath);
        }
    }
    function searchMatchesImage(image, query) {
        if (!query) {
            return true;
        }
        const lowerQuery = query.toLowerCase();
        return image.searchBlob.includes(lowerQuery);
    }
    function renderImageDetail(image) {
        if (!image) {
            elements.imagePreview.innerHTML = '<div class="empty-note">Pick an image to preview it here.</div>';
            elements.imagePreviewName.textContent = "No image selected";
            elements.imagePreviewMeta.textContent = "";
            elements.imagePreviewPath.textContent = "";
            return;
        }
        elements.imagePreviewName.textContent = image.name;
        elements.imagePreviewMeta.textContent = `${formatFileSize(image.size)} | ${new Date(image.lastModified).toLocaleString()}`;
        elements.imagePreviewPath.textContent = image.relativePath;
        elements.imagePreview.innerHTML = "";
        if (image.objectUrl) {
            const tag = document.createElement("img");
            tag.src = image.objectUrl;
            tag.alt = image.name;
            tag.className = "image-preview-tag";
            elements.imagePreview.appendChild(tag);
        }
        else {
            const placeholder = document.createElement("div");
            placeholder.className = "empty-note";
            placeholder.textContent = "Preview unavailable in the cached index. Reload the backup folder to reattach the actual image file.";
            elements.imagePreview.appendChild(placeholder);
        }
        saveUiState();
    }
    function renderImagesView() {
        const query = elements.searchInput.value.trim();
        const sort = elements.sortSelect.value;
        if (!state.index) {
            elements.conversationList.innerHTML = "";
            elements.resultCaption.textContent = "No export loaded yet.";
            elements.statResults.textContent = "0";
            updateConversationListPager();
            renderImageDetail(null);
            return;
        }
        state.filteredImages = state.index.images
            .filter((image) => searchMatchesImage(image, query))
            .sort((a, b) => compareImages(a, b, sort));
        elements.resultCaption.textContent = `${state.filteredImages.length} matching image${state.filteredImages.length === 1 ? "" : "s"}`;
        elements.statResults.textContent = String(state.filteredImages.length);
        elements.imageCount.textContent = `${state.filteredImages.length} visible image${state.filteredImages.length === 1 ? "" : "s"}`;
        if (!state.filteredImages.length) {
            elements.conversationList.innerHTML = '<div class="empty-note">No images match. Try a different search.</div>';
            elements.imageGrid.innerHTML = '<div class="empty-note">No images to show.</div>';
            updateConversationListPager();
            renderImageDetail(null);
            return;
        }
        if (!state.filteredImages.some((image) => image.id === state.selectedImageId)) {
            state.selectedImageId = state.filteredImages[0].id;
        }
        const listButtons = state.filteredImages.map((image) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "conversation-item";
            if (image.id === state.selectedImageId) {
                button.classList.add("active");
            }
            button.innerHTML = `
        <h3>${escapeHtml(image.name)}</h3>
        <p>${escapeHtml(image.relativePath)}</p>
        <div class="conversation-item-meta">
          <span>${formatFileSize(image.size)}</span>
          <span>${escapeHtml(new Date(image.lastModified).toLocaleDateString())}</span>
        </div>
      `;
            button.addEventListener("click", () => {
                state.selectedImageId = image.id;
                renderImagesView();
            });
            return button;
        });
        const tiles = state.filteredImages.map((image) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "image-tile";
            if (image.id === state.selectedImageId) {
                button.classList.add("active");
            }
            if (image.objectUrl) {
                button.innerHTML = `
          <img src="${image.objectUrl}" alt="${escapeHtml(image.name)}">
          <span>${escapeHtml(image.name)}</span>
        `;
            }
            else {
                button.innerHTML = `
          <div class="image-tile-placeholder">Preview unavailable</div>
          <span>${escapeHtml(image.name)}</span>
        `;
            }
            button.addEventListener("click", () => {
                state.selectedImageId = image.id;
                renderImagesView();
            });
            return button;
        });
        elements.conversationList.replaceChildren(...listButtons);
        elements.imageGrid.replaceChildren(...tiles);
        updateConversationListPager();
        renderImageDetail(state.filteredImages.find((image) => image.id === state.selectedImageId) || null);
    }
    window.ChatBrowser.imageRender = {
        renderImagesView,
    };
})();
