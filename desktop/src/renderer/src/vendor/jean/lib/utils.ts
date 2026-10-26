// Adapted from coollabsio/jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3; see vendor/jean/NOTICE.md.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
