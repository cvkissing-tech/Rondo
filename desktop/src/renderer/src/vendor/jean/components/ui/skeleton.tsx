// Adapted from coollabsio/jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3; see vendor/jean/NOTICE.md.
import { cn } from '@jean/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
