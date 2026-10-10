export type FileResult<T> =
  | { status: "ok"; value: T }
  | { status: "cancelled" }
  | { status: "error" };

export interface FileDialogCopy {
  title: string;
  filter: string;
  button: string;
}

export interface CloseState {
  dirty: boolean;
  busy: boolean;
  title: string;
  message: string;
  detail: string;
  stay: string;
  leave: string;
}

/** What a save says about itself (GDD v1.35), written by the worker into every save. */
export interface SaveHeader {
  sportName: string;
  anchorCountryId: string;
  turn: number;
  year: number;
  quarterOfYear: number;
}

/** A save in the saves folder, newest first on the Load screen. */
export interface SaveEntry {
  name: string;
  /** Milliseconds since the epoch, from the file. */
  savedAt: number;
  autosave: boolean;
  /** Null for a save from before headers, or one that cannot be read. */
  header: SaveHeader | null;
}

/** No arbitrary paths or generic IPC are exposed to the renderer. */
export interface SaveFiles {
  save: (text: string, copy: FileDialogCopy) => Promise<FileResult<string>>;
  open: (copy: FileDialogCopy) => Promise<FileResult<{ text: string; name: string }>>;
  /** The saves folder's saves, newest first (GDD v1.35). */
  list: () => Promise<FileResult<SaveEntry[]>>;
  /** Opens a save from the saves folder by its file name. */
  openNamed: (name: string) => Promise<FileResult<{ text: string; name: string }>>;
  /** Writes the newest autosave, keeping the last few. */
  autosave: (text: string) => Promise<FileResult<string>>;
  closeState: (state: CloseState) => void;
  acceptLoad: () => void;
}
