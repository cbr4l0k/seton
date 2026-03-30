import { useEffect, useState } from "react";

export type WorkspacePosition = "top" | "left" | "center" | "right" | "bottom";

const arrowMap: Record<string, WorkspacePosition> = {
  ArrowUp: "top",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "bottom",
};

export function useSpatialNavigation(initialPosition: WorkspacePosition = "center") {
  const [position, setPosition] = useState<WorkspacePosition>(initialPosition);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target.isContentEditable ||
        target.closest(".cm-editor") !== null
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isEditableTarget(event.target)) {
          event.preventDefault();
          (event.target as HTMLElement).blur();
          return;
        }

        event.preventDefault();
        setPosition("center");
        return;
      }

      const nextPosition = arrowMap[event.key];
      if (!nextPosition) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setPosition(nextPosition);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { position, setPosition };
}
