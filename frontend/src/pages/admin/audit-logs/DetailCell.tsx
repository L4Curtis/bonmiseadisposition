import { formatDetailEntry } from './detailFormatting';

export function DetailCell({ details }: { details?: Record<string, unknown> }) {
  if (!details) return <span className="text-muted-foreground/70">—</span>;
  const chips = Object.entries(details)
    .map(([k, v]) => formatDetailEntry(k, v))
    .filter((x): x is string => !!x);
  if (chips.length === 0) return <span className="text-muted-foreground/70">—</span>;
  return (
    <div className="flex flex-wrap gap-1" title={JSON.stringify(details, null, 2)}>
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground whitespace-nowrap"
        >
          {c}
        </span>
      ))}
    </div>
  );
}
