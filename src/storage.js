export function formatBytes(bytes = 0) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(value));
}

export function extensionFromName(name = "") {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop().toUpperCase() : "FILE";
}

export function estimateItemSize(item) {
    if (item.content instanceof Blob) return item.content.size;
    const raw = JSON.stringify({
        title: item.title,
        type: item.type,
        mimeType: item.mimeType,
        content: item.content,
        preview: item.preview,
        metadata: item.metadata,
        tags: item.tags
    });
    return new Blob([raw]).size;
}

export async function getStorageSummary(items) {
    const estimatedBytes = items.reduce((sum, item) => sum + estimateItemSize(item), 0);
    let quota;
    let usage;

    if (navigator.storage?.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            quota = estimate.quota;
            usage = estimate.usage;
        } catch {
            quota = undefined;
            usage = undefined;
        }
    }

    return {
        itemCount: items.length,
        estimatedBytes,
        browserUsage: usage,
        quota
    };
}

export function typeIcon(type) {
    return {
        text: "T",
        html: "H",
        image: "I",
        file: "F",
        url: "U"
    }[type] || "?";
}

export function safeText(value = "") {
    const node = document.createElement("span");
    node.textContent = value;
    return node.innerHTML;
}

export function safeAttr(value = "") {
    return safeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
