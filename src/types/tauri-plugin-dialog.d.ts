declare module "@tauri-apps/plugin-dialog" {
  export type DialogFilter = {
    name: string;
    extensions: string[];
  };

  export type OpenDialogOptions = {
    multiple?: boolean;
    filters?: DialogFilter[];
  };

  export function open(
    options?: OpenDialogOptions,
  ): Promise<string | string[] | null>;
}
