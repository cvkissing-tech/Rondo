// Adapted from coollabsio/jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3; see vendor/jean/NOTICE.md.
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@jean/lib/utils'

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Label }
