import type { FinalValidationResult } from './validator.js'

export type RunPhase = 'discover' | 'extract' | 'read' | 'generate' | 'write'

export type FileEvent = {
  timestamp: string // ISO 8601
  path: string
}

export type RunResult = {
  status: 'ok' | 'warn' | 'error'
  startedAt: string
  finishedAt: string
  channel: string | null
  phases: RunPhase[] // phases actually completed, in order
  events: {
    defaultProfileExtracted: FileEvent | null
    actionMapsRead: FileEvent | null
    customProfileWritten: FileEvent | null
    actionMapsWritten: FileEvent | null // null when skipped (SC running)
    reportWritten: FileEvent | null
  }
  validation: FinalValidationResult | null
  bindsGenerated: number
  errorMessage: string | null
}
