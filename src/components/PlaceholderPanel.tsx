type PlaceholderPanelProps = {
  title: string;
  active: boolean;
  position: "top" | "left" | "right";
};

export function PlaceholderPanel({ title, active, position }: PlaceholderPanelProps) {
  return (
    <section
      aria-label={`${title} panel`}
      className={`panel panel-placeholder panel-${position}`}
      data-active={active}
    >
      <p className="panel-subtle-title">{title}</p>
    </section>
  );
}
