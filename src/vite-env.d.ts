/// <reference types="vite/client" />

// File System Access API (Chromium), not yet in TypeScript's DOM library.
type FilePickerType = { description?: string; accept: Record<string, string[]> };
type FilePermission = { mode?: "read" | "readwrite" };

interface FileSystemHandle {
  queryPermission(descriptor?: FilePermission): Promise<PermissionState>;
  requestPermission(descriptor?: FilePermission): Promise<PermissionState>;
}

interface Window {
  showOpenFilePicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
    multiple?: boolean;
    types?: FilePickerType[];
  }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: {
    id?: string;
    suggestedName?: string;
    types?: FilePickerType[];
  }): Promise<FileSystemFileHandle>;
}
