import { createStore, del, get, set } from "idb-keyval";

// File handles cannot be serialized to localStorage: the browser only lets them live in IndexedDB.
// Everything else (file list, schemas, views) is in localStorage, see workspace-store.ts.
const store = createStore("local-csv-viewer", "handles");

export const saveHandle = (id: string, handle: FileSystemFileHandle) => set(id, handle, store);
export const loadHandle = (id: string) => get<FileSystemFileHandle>(id, store);
export const deleteHandle = (id: string) => del(id, store);

export const isSupported = () => typeof window !== "undefined" && "showOpenFilePicker" in window;

const CSV_TYPES = [{ description: "Fichier CSV", accept: { "text/csv": [".csv", ".tsv", ".txt"] } }];

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Opens the file picker with read and write access. Returns nothing when the user cancels. */
export async function pickCsvFile() {
  try {
    const [handle] = await window.showOpenFilePicker({ id: "csv", mode: "readwrite", types: CSV_TYPES });
    return handle;
  } catch (error) {
    if (isAbort(error)) return;
    throw error;
  }
}

export async function createCsvFile() {
  try {
    return await window.showSaveFilePicker({ id: "csv", suggestedName: "nouveau.csv", types: CSV_TYPES });
  } catch (error) {
    if (isAbort(error)) return;
    throw error;
  }
}

const READWRITE = { mode: "readwrite" } as const;

export const hasPermission = async (handle: FileSystemFileHandle) =>
  (await handle.queryPermission(READWRITE)) === "granted";

/** Must be called from a click: the browser shows its permission prompt. */
export const requestPermission = async (handle: FileSystemFileHandle) =>
  (await handle.requestPermission(READWRITE)) === "granted";

export async function readHandle(handle: FileSystemFileHandle) {
  const file = await handle.getFile();
  return { buffer: await file.arrayBuffer(), lastModified: file.lastModified };
}

/** Writes through a swap file: the CSV on disk is replaced only once the new content is complete. */
export async function writeHandle(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
  return (await handle.getFile()).lastModified;
}

export const lastModified = async (handle: FileSystemFileHandle) => (await handle.getFile()).lastModified;
