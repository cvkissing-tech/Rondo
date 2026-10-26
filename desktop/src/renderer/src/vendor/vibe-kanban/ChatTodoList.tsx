// Adapted from BloopAI/vibe-kanban d5cbb5380fa0b32e98ef9b8d987f63decce4be3a.
// Apache-2.0; see LICENSE and NOTICE.md for source and adaptation notes.
import type { ReactNode } from 'react'
import { ListChecks as ListChecksIcon, ChevronDown as CaretDownIcon } from 'lucide-react'
import { Circle, Check, CircleDot } from 'lucide-react'
import { cn } from '@jean/lib/utils'

export interface TodoItemLike {
  content: string
  details?: ReactNode
  status?: string | null
}

interface ChatTodoListProps {
  todos: TodoItemLike[]
  expanded?: boolean
  onToggle?: () => void
}

function getStatusIcon(status?: string | null) {
  const s = (status || '').toLowerCase()
  if (s === 'completed') return <Check aria-hidden className="h-4 w-4 text-success" />
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDot aria-hidden className="h-4 w-4 text-blue-500" />
  if (s === 'cancelled') return <Circle aria-hidden className="h-4 w-4 text-gray-400" />
  return <Circle aria-hidden className="h-4 w-4 text-muted-foreground" />
}

export function ChatTodoList({ todos, expanded, onToggle }: ChatTodoListProps) {
  return (
    <div className="text-sm">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-base text-low cursor-pointer text-left"
        onClick={onToggle}
      >
        <ListChecksIcon className="shrink-0 size-icon-base" />
        <span className="flex-1">计划步骤</span>
        <CaretDownIcon
          className={cn('shrink-0 size-icon-base transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && todos.length > 0 && (
        <ul className="pt-base ml-6 [&>li+li]:pt-1">
          {todos.map((todo, index) => (
            <li key={`${todo.content}-${index}`} className="flex items-start gap-2">
              <span className="pt-0.5 h-4 w-4 flex items-center justify-center shrink-0">
                {getStatusIcon(todo.status)}
              </span>
              <div className="min-w-0 flex-1 leading-5 break-words">
                {todo.status?.toLowerCase() === 'cancelled' ? (
                  <s className="text-gray-400">{todo.content}</s>
                ) : (
                  todo.content
                )}
                {todo.details && <div className="pt-base space-y-2">{todo.details}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
