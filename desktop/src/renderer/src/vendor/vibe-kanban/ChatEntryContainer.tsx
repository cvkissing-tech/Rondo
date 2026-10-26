// Adapted from BloopAI/vibe-kanban d5cbb5380fa0b32e98ef9b8d987f63decce4be3a.
// Apache-2.0; see LICENSE and NOTICE.md for source and adaptation notes.
import type { ComponentType, ReactNode } from 'react'
import {
  ChevronDown as CaretDownIcon,
  User as UserIcon,
  ListChecks as ListChecksIcon,
  Settings as GearIcon,
  type LucideProps as IconProps
} from 'lucide-react'
import { cn } from '@jean/lib/utils'

type Variant = 'user' | 'plan' | 'plan_denied' | 'system'

export interface ChatEntryStatusLike {
  status: string
}

interface VariantConfig {
  icon: ComponentType<IconProps>
  border: string
  headerBg: string
  bg: string
}

const variantConfig: Record<Variant, VariantConfig> = {
  user: {
    icon: UserIcon,
    border: 'border-border',
    headerBg: '',
    bg: ''
  },
  plan: {
    icon: ListChecksIcon,
    border: 'border-brand',
    headerBg: 'bg-brand/20',
    bg: 'bg-brand/10'
  },
  plan_denied: {
    icon: ListChecksIcon,
    border: 'border-error',
    headerBg: 'bg-error/20',
    bg: 'bg-error/10'
  },
  system: {
    icon: GearIcon,
    border: 'border-border',
    headerBg: 'bg-gray-50 dark:bg-gray-900/30',
    bg: ''
  }
}

interface ChatEntryContainerProps {
  variant: Variant
  title?: ReactNode
  headerRight?: ReactNode
  expanded?: boolean
  onToggle?: () => void
  children?: ReactNode
  actions?: ReactNode
  className?: string
  status?: ChatEntryStatusLike
  isGreyed?: boolean
}

export function ChatEntryContainer({
  variant,
  title,
  headerRight,
  expanded = false,
  onToggle,
  children,
  actions,
  className,
  status,
  isGreyed
}: ChatEntryContainerProps) {
  // Special case for plan denied
  const config =
    variant === 'plan' && status?.status === 'denied'
      ? variantConfig.plan_denied
      : variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      data-vibe-ui="entry"
      className={cn(
        'rounded-sm w-full',
        config.border && 'border',
        config.border,
        config.bg,
        isGreyed && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {/* Keep actions beside the disclosure control, never nested inside it. */}
      <div
        className={cn(
          'flex items-center px-double py-base gap-base rounded-sm overflow-hidden',
          config.headerBg
        )}
      >
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-base text-left cursor-pointer"
          >
            <Icon className="size-icon-xs shrink-0 text-low" />
            {title && <span className="flex-1 text-sm text-normal truncate">{title}</span>}
            <CaretDownIcon
              className={cn(
                'size-icon-xs shrink-0 text-low transition-transform',
                !expanded && '-rotate-90'
              )}
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-base">
            <Icon className="size-icon-xs shrink-0 text-low" />
            {title && <span className="flex-1 text-sm text-normal truncate">{title}</span>}
          </div>
        )}
        {headerRight}
      </div>

      {/* Content - shown when expanded */}
      {expanded && children && <div className="p-double">{children}</div>}

      {/* Actions footer - optional */}
      {actions && (
        <div className="bg-brand/20 backdrop-blur-sm flex items-center gap-base px-double py-base border-t sticky bottom-0 rounded-md">
          {actions}
        </div>
      )}
    </div>
  )
}
