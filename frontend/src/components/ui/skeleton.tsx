import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
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
