import {
    clearItems,
    createId,
    deleteItems,
    deserializeItems,
    getAllItems,
    saveItem,
    saveItems,
    serializeItems
} from "./database.js";
import { createTextItem, downloadJson, parseDroppedFiles, parsePasteEvent } from "./paste.js";
import { getStorageSummary } from "./storage.js";
import {
    bindUi,
    confirmAction,
    endDrag,
    getFilters,
    render,
    renderStorage,
    setTheme,
    showToast
} from "./ui.js";

let items = [];
let selectedIds = new Set();
let lastDeleted = [];

const app = {
    async init() {
        bindUi({
            onPaste: handlePaste,
            onDrop: handleDrop,
            onFilterChange: refresh,
            onThemeToggle: toggleTheme,
            onPatch: patchItem,
            onSelect: selectItem,
            onClearSelection: clearSelection,
            onDeleteOne: deleteOne,
            onDeleteSelected: deleteSelected,
            onDeleteAll: deleteAll,
            onDuplicate: duplicateItem,
            onExportAll: () => exportItems(items, "pastebin-export.json"),
            onExportSelected: exportSelected,
            onImport: importFile
        });

        setTheme(localStorage.getItem("pastebinTheme") || "light");
        await loadItems();
        refresh();
        showToast("pastebin is ready.");
    }
};

app.init().catch((error) => {
    console.error(error);
    showToast("pastebin could not start. IndexedDB may be unavailable.", "error");
});

async function loadItems() {
    items = await getAllItems();
}

async function handlePaste(event) {
    if (event.pastebinHandled) return;
    event.pastebinHandled = true;
    event.preventDefault();
    event.stopPropagation();
    try {
        const parsed = await parsePasteEvent(event);
        if (!parsed.length) {
            showToast("Nothing supported was found to paste.", "error");
            return;
        }
        await saveItems(parsed);
        items = [...parsed, ...items];
        refresh();
        showToast(`Saved ${parsed.length} item${parsed.length === 1 ? "" : "s"}.`);
    } catch (error) {
        showToast(error.message || "Paste failed.", "error");
    }
}

async function handleDrop(event) {
    event.preventDefault();
    endDrag();
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    try {
        const parsed = await parseDroppedFiles(files);
        await saveItems(parsed);
        items = [...parsed, ...items];
        refresh();
        showToast(`Imported ${parsed.length} file${parsed.length === 1 ? "" : "s"}.`);
    } catch (error) {
        showToast(error.message || "Drop import failed.", "error");
    }
}

async function patchItem(id, patch) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const updated = { ...item, ...patch, updatedAt: new Date().toISOString() };
    await saveItem(updated);
    items = items.map((entry) => (entry.id === id ? updated : entry));
    refresh();
}

function selectItem(id, selected) {
    selected ? selectedIds.add(id) : selectedIds.delete(id);
    refresh();
}

function clearSelection() {
    selectedIds = new Set();
    refresh();
}

async function deleteOne(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const confirmed = await confirmAction("Delete item?", `"${item.title}" will be removed from this browser.`);
    if (!confirmed) return;
    await deleteItemsWithUndo([id]);
}

async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const confirmed = await confirmAction("Delete selected items?", `${ids.length} selected item${ids.length === 1 ? "" : "s"} will be removed.`);
    if (!confirmed) return;
    await deleteItemsWithUndo(ids);
}

async function deleteAll() {
    if (!items.length) return;
    const confirmed = await confirmAction("Delete all items?", "This removes every saved item stored in this browser.");
    if (!confirmed) return;
    lastDeleted = [...items];
    await clearItems();
    items = [];
    selectedIds = new Set();
    refresh();
    showUndoToast("Deleted all items.");
}

async function deleteItemsWithUndo(ids) {
    lastDeleted = items.filter((item) => ids.includes(item.id));
    await deleteItems(ids);
    items = items.filter((item) => !ids.includes(item.id));
    selectedIds = new Set([...selectedIds].filter((id) => !ids.includes(id)));
    refresh();
    showUndoToast(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
}

function showUndoToast(message) {
    showToast(message, "success", {
        label: "Undo",
        onClick: async () => {
            if (!lastDeleted.length) return;
            await saveItems(lastDeleted);
            items = [...lastDeleted, ...items];
            lastDeleted = [];
            refresh();
            showToast("Restored.");
        }
    });
}

async function duplicateItem(item) {
    const now = new Date().toISOString();
    const copy = {
        ...item,
        id: createId(),
        title: `${item.title} copy`,
        favorite: false,
        pinned: false,
        createdAt: now,
        updatedAt: now
    };
    await saveItem(copy);
    items = [copy, ...items];
    refresh();
    showToast("Duplicated item.");
}

async function exportItems(itemsToExport, filename) {
    if (!itemsToExport.length) {
        showToast("There is nothing to export.", "error");
        return;
    }
    const data = {
        app: "pastebin",
        exportedAt: new Date().toISOString(),
        version: 1,
        items: await serializeItems(itemsToExport)
    };
    downloadJson(filename, data);
    showToast(`Exported ${itemsToExport.length} item${itemsToExport.length === 1 ? "" : "s"}.`);
}

async function exportSelected() {
    const selected = items.filter((item) => selectedIds.has(item.id));
    await exportItems(selected, "pastebin-selected.json");
}

async function importFile(file) {
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        const incoming = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(incoming)) throw new Error("Import file does not contain pastebin items.");
        const restored = await deserializeItems(incoming);
        await saveItems(restored);
        items = [...restored, ...items];
        refresh();
        showToast(`Imported ${restored.length} item${restored.length === 1 ? "" : "s"}.`);
    } catch (error) {
        showToast(error.message || "Import failed.", "error");
    }
}

function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("pastebinTheme", nextTheme);
    setTheme(nextTheme);
}

async function refresh() {
    const filtered = applyFilters(items);
    render(items, filtered, selectedIds);
    renderStorage(await getStorageSummary(items));
}

function applyFilters(source) {
    const { search, sort } = getFilters();
    const filtered = search
        ? source.filter((item) => searchableText(item).includes(search))
        : [...source];

    return filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
        if (sort === "type") return a.type.localeCompare(b.type) || b.createdAt.localeCompare(a.createdAt);
        if (sort === "name") return a.title.localeCompare(b.title);
        if (sort === "favorites") {
            if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
            return b.createdAt.localeCompare(a.createdAt);
        }
        return b.createdAt.localeCompare(a.createdAt);
    });
}

function searchableText(item) {
    return [
        item.title,
        item.type,
        item.mimeType,
        item.preview,
        typeof item.content === "string" ? item.content : "",
        item.metadata?.fileName,
        ...(item.tags || [])
    ].filter(Boolean).join(" ").toLowerCase();
}

window.addEventListener("paste", async (event) => {
    if (event.defaultPrevented || event.pastebinHandled) return;
    if (document.activeElement?.matches("input, textarea, [contenteditable='true']")) return;
    await handlePaste(event);
});

window.addEventListener("error", (event) => {
    showToast(event.message || "Something went wrong.", "error");
});

window.PastebinDebug = {
    createTextItem,
    get items() {
        return items;
    }
};
