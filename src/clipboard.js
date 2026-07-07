import { createId } from "./database.js";

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function supportsHtmlClipboard() {
    return Boolean(window.ClipboardItem && navigator.clipboard?.write);
}

export async function parsePasteEvent(event) {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return [];

    const files = [...clipboardData.files];
    for (const item of clipboardData.items || []) {
        if (item.kind === "file") {
            const file = item.getAsFile();
            if (file && !files.some((entry) => entry.name === file.name && entry.size === file.size && entry.type === file.type)) {
                files.push(file);
            }
        }
    }
    const items = [];

    for (const file of files) {
        items.push(await createItemFromFile(file));
    }

    const html = clipboardData.getData("text/html");
    const text = clipboardData.getData("text/plain");

    if (html) {
        items.push(createHtmlItem(html, text));
    } else if (text) {
        items.push(createTextItem(text));
    }

    return dedupeItems(items);
}

export async function parseDroppedFiles(fileList) {
    return Promise.all([...fileList].map((file) => createItemFromFile(file)));
}

export function createTextItem(text) {
    const isUrl = URL_PATTERN.test(text.trim());
    const preview = text.trim().slice(0, 240);
    return baseItem({
        type: isUrl ? "url" : "text",
        mimeType: "text/plain",
        title: isUrl ? urlTitle(text.trim()) : titleFromText(text),
        content: text,
        preview
    });
}

export function createHtmlItem(html, fallbackText = "") {
    const text = fallbackText || htmlToText(html);
    return baseItem({
        type: "html",
        mimeType: "text/html",
        title: titleFromText(text || "HTML clipping"),
        content: html,
        preview: text.slice(0, 240),
        metadata: { plainText: text }
    });
}

export async function createItemFromFile(file) {
    if (file.type.startsWith("image/")) {
        const dimensions = await getImageDimensions(file).catch(() => ({ width: null, height: null }));
        return baseItem({
            type: "image",
            mimeType: file.type || "image/*",
            title: file.name || "Pasted image",
            content: file,
            preview: file.name || "Image",
            metadata: {
                fileName: file.name || "clipboard-image.png",
                size: file.size,
                width: dimensions.width,
                height: dimensions.height,
                format: file.type || "image"
            }
        });
    }

    return baseItem({
        type: "file",
        mimeType: file.type || "application/octet-stream",
        title: file.name || "Pasted file",
        content: file,
        preview: file.name || "File",
        metadata: {
            fileName: file.name || "download",
            size: file.size,
            extension: file.name?.includes(".") ? file.name.split(".").pop() : ""
        }
    });
}

function baseItem(fields) {
    const now = new Date().toISOString();
    return {
        id: createId(),
        favorite: false,
        pinned: false,
        tags: [],
        color: "none",
        createdAt: now,
        updatedAt: now,
        ...fields
    };
}

function titleFromText(text = "") {
    const cleaned = text.trim().replace(/\s+/g, " ");
    return cleaned ? cleaned.slice(0, 64) : "Untitled text";
}

function urlTitle(value) {
    try {
        const url = new URL(value);
        return url.hostname.replace(/^www\./, "");
    } catch {
        return "Saved URL";
    }
}

function htmlToText(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    return document.body.textContent?.trim().replace(/\s+/g, " ") || "";
}

function getImageDimensions(blob) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(blob);
        image.onload = () => {
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
            URL.revokeObjectURL(url);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Unable to read image dimensions."));
        };
        image.src = url;
    });
}

function dedupeItems(items) {
    const hasFile = items.some((item) => item.type === "file" || item.type === "image");
    if (hasFile) {
        return items.filter((item) => item.type === "file" || item.type === "image" || item.type === "html");
    }
    return items;
}

export async function copyItem(item, mode = "default") {
    if (item.type === "html" && mode === "html") {
        if (!supportsHtmlClipboard()) throw new Error("Copying rich HTML is not supported in this browser.");
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob([item.content], { type: "text/html" }),
                "text/plain": new Blob([item.metadata?.plainText || item.preview || ""], { type: "text/plain" })
            })
        ]);
        return "Copied HTML.";
    }

    if (item.type === "image") {
        if (!window.ClipboardItem || !navigator.clipboard?.write) {
            throw new Error("Copying images is not supported. Download the image instead.");
        }
        await navigator.clipboard.write([new ClipboardItem({ [item.mimeType || item.content.type]: item.content })]);
        return "Copied image.";
    }

    const text = item.type === "html" && mode === "plain" ? item.metadata?.plainText || item.preview : item.content;
    await navigator.clipboard.writeText(String(text || ""));
    return "Copied.";
}

export function downloadItem(item) {
    const blob = item.content instanceof Blob ? item.content : new Blob([item.content || ""], { type: item.mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName(item);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function downloadJson(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function downloadName(item) {
    if (item.metadata?.fileName) return item.metadata.fileName;
    const clean = item.title.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "clipboard-item";
    const ext = item.type === "html" ? "html" : item.type === "url" ? "url.txt" : "txt";
    return `${clean}.${ext}`;
}
