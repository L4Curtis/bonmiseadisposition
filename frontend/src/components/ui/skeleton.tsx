import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLElement> {
  /** Élément rendu. `span` quand le squelette remplace du texte à l'intérieur
   *  d'un paragraphe : un `div` dans un `p` est un balisage invalide, que le
   *  navigateur corrige en fermant le `p` — React le signale à juste titre. */
  readonly as?: 'div' | 'span';
}

function Skeleton({ className, as: Tag = 'div', ...props }: SkeletonProps) {
  return (
    <Tag
      className={cn(
        // Shimmer balayé plutôt que pulse — la vague respecte prefers-reduced-motion
        'relative overflow-hidden rounded-md bg-muted',
        'after:absolute after:inset-0 after:-translate-x-full motion-safe:after:animate-[shimmer_1.6s_ease-in-out_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.05] after:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
