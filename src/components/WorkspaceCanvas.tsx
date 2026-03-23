import type { PropsWithChildren } from "react";

import type { WorkspacePosition } from "../hooks/useSpatialNavigation";

type WorkspaceCanvasProps = PropsWithChildren<{
  position: WorkspacePosition;
}>;

export function WorkspaceCanvas({ position, children }: WorkspaceCanvasProps) {
  return (
    <main className="app-shell" data-active-position={position}>
      <div aria-hidden="true" className="ambient-bg" data-testid="ambient-background">
        <div className="ambient-ribbon ambient-ribbon--green" data-testid="ambient-ribbon" />
        <div className="ambient-ribbon ambient-ribbon--cyan" data-testid="ambient-ribbon" />
        <div className="ambient-ribbon ambient-ribbon--lower" data-testid="ambient-ribbon" />
        <div className="ambient-shape ambient-shape--green" data-testid="ambient-shape" />
        <div className="ambient-shape ambient-shape--blue" data-testid="ambient-shape" />
        <div className="ambient-veil" />
        <div className="ambient-grain" />
      </div>

      {children}
    </main>
  );
}
