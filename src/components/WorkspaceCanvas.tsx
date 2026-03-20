import type { PropsWithChildren } from "react";

import type { WorkspacePosition } from "../hooks/useSpatialNavigation";

type WorkspaceCanvasProps = PropsWithChildren<{
  position: WorkspacePosition;
}>;

export function WorkspaceCanvas({ position, children }: WorkspaceCanvasProps) {
  return (
    <main className="app-shell" data-active-position={position}>
      {children}
    </main>
  );
}
