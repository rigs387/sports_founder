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

/** No arbitrary paths or generic IPC are exposed to the renderer. */
export interface SaveFiles {
  save: (text: string, copy: FileDialogCopy) => Promise<FileResult<string>>;
  open: (copy: FileDialogCopy) => Promise<FileResult<{ text: string; name: string }>>;
  closeState: (state: CloseState) => void;
  acceptLoad: () => void;
}
