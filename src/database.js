const DB_NAME = "pastebin";
const DB_VERSION = 1;
const STORE_NAME = "items";

let dbPromise;

export function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("createdAt", "createdAt");
                store.createIndex("type", "type");
                store.createIndex("favorite", "favorite");
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

function transaction(mode = "readonly") {
    return openDatabase().then((db) => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function promisify(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllItems() {
    const store = await transaction();
    return promisify(store.getAll());
}

export async function getItem(id) {
    const store = await transaction();
    return promisify(store.get(id));
}

export async function saveItem(item) {
    const store = await transaction("readwrite");
    await promisify(store.put(item));
    return item;
}

export async function saveItems(items) {
    const store = await transaction("readwrite");
    await Promise.all(items.map((item) => promisify(store.put(item))));
    return items;
}

export async function deleteItem(id) {
    const store = await transaction("readwrite");
    return promisify(store.delete(id));
}

export async function deleteItems(ids) {
    const store = await transaction("readwrite");
    await Promise.all(ids.map((id) => promisify(store.delete(id))));
}

export async function clearItems() {
    const store = await transaction("readwrite");
    return promisify(store.clear());
}

export function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
}

export async function serializeItems(items) {
    return Promise.all(items.map(async (item) => {
        const copy = { ...item };
        if (copy.content instanceof Blob) {
            copy.content = {
                kind: "blob",
                mimeType: copy.content.type || copy.mimeType || "application/octet-stream",
                dataUrl: await blobToDataUrl(copy.content)
            };
        }
        return copy;
    }));
}

export async function deserializeItems(items) {
    return Promise.all(items.map(async (item) => {
        const copy = { ...item };
        if (copy.content?.kind === "blob" && copy.content.dataUrl) {
            copy.content = await dataUrlToBlob(copy.content.dataUrl);
        }
        return {
            ...copy,
            id: createId(),
            importedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }));
}
