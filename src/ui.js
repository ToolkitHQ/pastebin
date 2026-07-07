import { downloadItem, copyItem } from "./paste.js";
import { extensionFromName, formatBytes, formatDate, safeAttr, safeText, typeIcon } from "./storage.js";

const elements = {};
let callbacks = {};
let state = {
    items: [],
    filteredItems: [],
    selectedIds: new Set(),
    objectUrls: new Map()
};

export function bindUi(appCallbacks) {
    callbacks = appCallbacks;
    Object.assign(elements, {
        searchInput: document.querySelector("#searchInput"),
        sortSelect: document.querySelector("#sortSelect"),
        themeToggle: document.querySelector("#themeToggle"),
        importButton: document.querySelector("#importButton"),
        exportButton: document.querySelector("#exportButton"),
        importFile: document.querySelector("#importFile"),
        pasteZone: document.querySelector("#pasteZone"),
        grid: document.querySelector("#historyGrid"),
        emptyState: document.querySelector("#emptyState"),
        usedSpace: document.querySelector("#usedSpace"),
        itemCount: document.querySelector("#itemCount"),
        storageQuota: document.querySelector("#storageQuota"),
        bulkBar: document.querySelector("#bulkBar"),
        selectedCount: document.querySelector("#selectedCount"),
        exportSelectedButton: document.querySelector("#exportSelectedButton"),
        deleteSelectedButton: document.querySelector("#deleteSelectedButton"),
        clearSelectionButton: document.querySelector("#clearSelectionButton"),
        deleteAllButton: document.querySelector("#deleteAllButton"),
        activityText: document.querySelector("#activityText"),
        renameDialog: document.querySelector("#renameDialog"),
        renameForm: document.querySelector("#renameForm"),
        renameInput: document.querySelector("#renameInput"),
        confirmDialog: document.querySelector("#confirmDialog"),
        confirmForm: document.querySelector("#confirmForm"),
        confirmTitle: document.querySelector("#confirmTitle"),
        confirmMessage: document.querySelector("#confirmMessage"),
        imageDialog: document.querySelector("#imageDialog"),
        modalImage: document.querySelector("#modalImage"),
        contextMenu: document.querySelector("#contextMenu"),
        toastStack: document.querySelector("#toastStack")
    });

    elements.searchInput.addEventListener("input", () => callbacks.onFilterChange());
    elements.sortSelect.addEventListener("change", () => callbacks.onFilterChange());
    elements.themeToggle.addEventListener("click", callbacks.onThemeToggle);
    elements.importButton.addEventListener("click", () => elements.importFile.click());
    elements.importFile.addEventListener("change", (event) => callbacks.onImport(event.target.files[0]));
    elements.exportButton.addEventListener("click", callbacks.onExportAll);
    elements.exportSelectedButton.addEventListener("click", callbacks.onExportSelected);
    elements.deleteSelectedButton.addEventListener("click", callbacks.onDeleteSelected);
    elements.clearSelectionButton.addEventListener("click", clearSelection);
    elements.deleteAllButton.addEventListener("click", callbacks.onDeleteAll);

    elements.pasteZone.addEventListener("paste", callbacks.onPaste);
    elements.pasteZone.addEventListener("click", () => elements.pasteZone.focus());
    elements.pasteZone.addEventListener("dragover", handleDragOver);
    elements.pasteZone.addEventListener("dragleave", () => elements.pasteZone.classList.remove("is-dragging"));
    elements.pasteZone.addEventListener("drop", callbacks.onDrop);

    document.addEventListener("keydown", handleShortcuts);
    document.addEventListener("click", hideContextMenu);
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
        button.addEventListener("click", () => button.closest("dialog")?.close());
    });
}

export function getFilters() {
    return {
        search: elements.searchInput.value.trim().toLowerCase(),
        sort: elements.sortSelect.value
    };
}

export function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    elements.themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
}

export function render(items, filteredItems, selectedIds) {
    state.items = items;
    state.filteredItems = filteredItems;
    state.selectedIds = selectedIds;
    revokeObjectUrls();

    elements.grid.innerHTML = filteredItems.map(renderCard).join("");
    elements.emptyState.hidden = items.length > 0;
    elements.grid.hidden = filteredItems.length === 0;
    elements.activityText.textContent = items.length
        ? `${filteredItems.length} of ${items.length} item${items.length === 1 ? "" : "s"} visible.`
        : "Ready for your first paste.";

    bindCardEvents();
    renderBulkBar();
}

export function renderStorage(summary) {
    elements.usedSpace.textContent = formatBytes(summary.browserUsage || summary.estimatedBytes);
    elements.itemCount.textContent = String(summary.itemCount);
    elements.storageQuota.textContent = summary.quota ? formatBytes(summary.quota) : "Unknown";
}

function renderCard(item) {
    const selected = state.selectedIds.has(item.id);
    const tags = (item.tags || []).map((tag) => `<span>${safeText(tag)}</span>`).join("");
    return `
        <article class="clip-card ${selected ? "is-selected" : ""}" data-id="${item.id}" style="${item.color && item.color !== "none" ? `--label:${item.color}` : ""}">
            <div class="card-top">
                <label class="check-wrap" title="Select item">
                    <input type="checkbox" data-action="select" ${selected ? "checked" : ""} />
                    <span></span>
                </label>
                <div class="type-icon">${typeIcon(item.type)}</div>
                <span class="badge">${item.type}</span>
                <button class="icon-button ${item.pinned ? "is-active" : ""}" data-action="pin" title="Pin">^</button>
                <button class="icon-button ${item.favorite ? "is-active" : ""}" data-action="favorite" title="Favorite">*</button>
            </div>
            <h3>${safeText(item.title)}</h3>
            ${renderPreview(item)}
            <div class="meta-row">
                <span>${formatDate(item.createdAt)}</span>
                ${renderMeta(item)}
            </div>
            <div class="tag-row">${tags}</div>
            <div class="card-actions">${renderActions(item)}</div>
        </article>
    `;
}

function renderPreview(item) {
    if (item.type === "image") {
        const url = URL.createObjectURL(item.content);
        state.objectUrls.set(item.id, url);
        return `<button class="image-preview" data-action="open-image"><img loading="lazy" src="${url}" alt="${safeAttr(item.title)}" /></button>`;
    }

    if (item.type === "html") {
        const escaped = safeText(item.content).slice(0, 1400);
        return `<iframe class="html-preview" sandbox srcdoc="${safeAttr(item.content)}" title="HTML preview"></iframe><p class="preview-text">${safeText(item.preview || escaped)}</p>`;
    }

    if (item.type === "url") {
        return `<a class="url-preview" href="${safeAttr(item.content)}" target="_blank" rel="noreferrer">${safeText(item.content)}</a>`;
    }

    if (item.type === "file") {
        return `<div class="file-preview"><strong>${extensionFromName(item.metadata?.fileName)}</strong><span>${safeText(item.metadata?.fileName || item.title)}</span></div>`;
    }

    return `<p class="preview-text">${safeText((item.preview || "").slice(0, 200))}</p>`;
}

function renderMeta(item) {
    if (item.type === "image") {
        const dimensions = item.metadata?.width ? `${item.metadata.width}x${item.metadata.height}` : "Image";
        return `<span>${dimensions}</span><span>${formatBytes(item.metadata?.size || 0)}</span>`;
    }
    if (item.type === "file") return `<span>${formatBytes(item.metadata?.size || 0)}</span>`;
    return `<span>${safeText(item.mimeType || "")}</span>`;
}

function renderActions(item) {
    const common = `
        <button class="button button--small" data-action="rename">Rename</button>
        <button class="button button--small button--ghost" data-action="tags">Tags</button>
        <button class="button button--small button--ghost" data-action="color">Label</button>
        <button class="button button--small button--ghost" data-action="duplicate">Duplicate</button>
        <button class="button button--small button--danger" data-action="delete">Delete</button>
    `;

    if (item.type === "html") {
        return `
            <button class="button button--small" data-action="copy-html">Copy HTML</button>
            <button class="button button--small button--ghost" data-action="copy-plain">Copy text</button>
            <button class="button button--small button--ghost" data-action="download">Download</button>
            ${common}
        `;
    }

    if (item.type === "image") {
        return `
            <button class="button button--small" data-action="copy">Copy</button>
            <button class="button button--small button--ghost" data-action="download">Download</button>
            <button class="button button--small button--ghost" data-action="open-image">Open</button>
            ${common}
        `;
    }

    if (item.type === "file") {
        return `
            <button class="button button--small" data-action="download">Download</button>
            ${common}
        `;
    }

    if (item.type === "url") {
        return `
            <button class="button button--small" data-action="open-url">Open</button>
            <button class="button button--small button--ghost" data-action="copy">Copy</button>
            ${common}
        `;
    }

    return `
        <button class="button button--small" data-action="copy">Copy</button>
        <button class="button button--small button--ghost" data-action="download">Download</button>
        ${common}
    `;
}

function bindCardEvents() {
    elements.grid.querySelectorAll(".clip-card").forEach((card) => {
        card.addEventListener("click", handleCardClick);
        card.addEventListener("contextmenu", handleContextMenu);
    });
}

async function handleCardClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const card = event.currentTarget;
    const item = findItem(card.dataset.id);
    if (!item) return;

    if (action === "select") return callbacks.onSelect(item.id, event.target.checked);
    if (action === "favorite") return callbacks.onPatch(item.id, { favorite: !item.favorite });
    if (action === "pin") return callbacks.onPatch(item.id, { pinned: !item.pinned });
    if (action === "rename") return openRenameDialog(item);
    if (action === "tags") return editTags(item);
    if (action === "color") return cycleColor(item);
    if (action === "delete") return callbacks.onDeleteOne(item.id);
    if (action === "duplicate") return callbacks.onDuplicate(item);
    if (action === "download") return downloadItem(item);
    if (action === "open-url") return window.open(item.content, "_blank", "noopener,noreferrer");
    if (action === "open-image") return openImageDialog(item);

    if (action.startsWith("copy")) {
        try {
            const mode = action === "copy-html" ? "html" : action === "copy-plain" ? "plain" : "default";
            showToast(await copyItem(item, mode));
        } catch (error) {
            showToast(error.message, "error");
        }
    }
}

function editTags(item) {
    const current = (item.tags || []).join(", ");
    const next = window.prompt("Tags separated by commas", current);
    if (next === null) return;
    const tags = next.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
    callbacks.onPatch(item.id, { tags });
}

function cycleColor(item) {
    const colors = ["none", "#176b87", "#6f5cc4", "#2f855a", "#c05621", "#b42318"];
    const index = colors.indexOf(item.color || "none");
    const color = colors[(index + 1) % colors.length];
    callbacks.onPatch(item.id, { color });
}

function handleContextMenu(event) {
    event.preventDefault();
    const item = findItem(event.currentTarget.dataset.id);
    if (!item) return;
    elements.contextMenu.innerHTML = `
        <button data-action="copy">Copy</button>
        <button data-action="rename">Rename</button>
        <button data-action="tags">Tags</button>
        <button data-action="color">Label color</button>
        <button data-action="duplicate">Duplicate</button>
        <button data-action="favorite">${item.favorite ? "Unfavorite" : "Favorite"}</button>
        <button data-action="delete">Delete</button>
    `;
    elements.contextMenu.hidden = false;
    elements.contextMenu.style.left = `${event.clientX}px`;
    elements.contextMenu.style.top = `${event.clientY}px`;
    elements.contextMenu.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
            hideContextMenu();
            const fakeTarget = document.createElement("button");
            fakeTarget.dataset.action = button.dataset.action;
            handleCardClick({ target: fakeTarget, currentTarget: event.currentTarget });
        });
    });
}

function hideContextMenu() {
    elements.contextMenu.hidden = true;
}

function openRenameDialog(item) {
    elements.renameInput.value = item.title;
    elements.renameDialog.showModal();
    elements.renameInput.focus();
    elements.renameForm.onsubmit = async (event) => {
        event.preventDefault();
        await callbacks.onPatch(item.id, { title: elements.renameInput.value.trim() || item.title });
        elements.renameDialog.close();
    };
}

export function confirmAction(title, message) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmDialog.showModal();
    return new Promise((resolve) => {
        elements.confirmForm.onsubmit = (event) => {
            event.preventDefault();
            elements.confirmDialog.close();
            resolve(true);
        };
        elements.confirmDialog.onclose = () => resolve(false);
    });
}

function openImageDialog(item) {
    const url = state.objectUrls.get(item.id) || URL.createObjectURL(item.content);
    elements.modalImage.src = url;
    elements.modalImage.alt = item.title;
    elements.imageDialog.showModal();
}

function handleDragOver(event) {
    event.preventDefault();
    elements.pasteZone.classList.add("is-dragging");
}

export function endDrag() {
    elements.pasteZone.classList.remove("is-dragging");
}

function handleShortcuts(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        elements.searchInput.focus();
    }
    if (document.activeElement?.matches("input, textarea, [contenteditable='true']")) return;
    if (event.key === "Delete" && state.selectedIds.size > 0) callbacks.onDeleteSelected();
    if (event.key === "Escape") {
        document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
        hideContextMenu();
    }
}

function renderBulkBar() {
    elements.bulkBar.hidden = state.selectedIds.size === 0;
    elements.selectedCount.textContent = `${state.selectedIds.size} selected`;
}

export function clearSelection() {
    callbacks.onClearSelection();
}

export function showToast(message, tone = "success", action) {
    const toast = document.createElement("div");
    toast.className = `toast toast--${tone}`;
    toast.innerHTML = `<span>${safeText(message)}</span>`;
    if (action) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        button.addEventListener("click", () => {
            action.onClick();
            toast.remove();
        });
        toast.append(button);
    }
    elements.toastStack.append(toast);
    setTimeout(() => toast.remove(), 6000);
}

function findItem(id) {
    return state.items.find((item) => item.id === id);
}

function revokeObjectUrls() {
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls.clear();
}
