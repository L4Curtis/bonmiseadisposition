import { actionMeta } from './actionMeta';

export function ActionBadge({ action }: { action: string }) {
  const meta = actionMeta(action);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}
