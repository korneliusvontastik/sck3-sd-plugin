import type { RunResult } from './run-result.js'

// Full, unfiltered write-up of a run — meant to be opened in a real text editor, since the
// Property Inspector's report box is too small to read a large conflict list comfortably.
export function formatReport(result: RunResult): string {
  const lines: string[] = []

  lines.push('SCK3 Keybind Auto-Fill — Run Report')
  lines.push(`Started:  ${result.startedAt}`)
  lines.push(`Finished: ${result.finishedAt}`)
  lines.push(`Channel:  ${result.channel ?? '—'}`)
  lines.push(`Status:   ${result.status}`)
  lines.push(`Binds generated: ${result.bindsGenerated}`)
  lines.push('')

  if (result.errorMessage) {
    lines.push('Error:')
    lines.push(`  ${result.errorMessage}`)
    lines.push('')
  }

  const stats = result.validation?.stats
  if (stats) {
    lines.push('Stats:')
    lines.push(`  Total actions:       ${stats.total}`)
    lines.push(`  Default bound:       ${stats.defaultBound}`)
    lines.push(`  User bound:          ${stats.userBound}`)
    lines.push(`  Filled:              ${stats.filled}`)
    lines.push(`  Unbound:             ${stats.unbound}`)
    lines.push(`  Axis (skipped):      ${stats.axisSkipped}`)
    lines.push(`  Flagged for testing: ${stats.flaggedForTesting}`)
    lines.push('')
    const inputTotal = stats.conflicts.defaultDefault + stats.conflicts.userDefault + stats.conflicts.userUser
    const outputTotal = stats.conflicts.outputVsExisting + stats.conflicts.outputVsGenerated
    lines.push('Conflicts — input (ignored, pre-existing CIG/user state — not this run\'s doing):')
    lines.push(`  Default / Default: ${stats.conflicts.defaultDefault}`)
    lines.push(`  User / Default:    ${stats.conflicts.userDefault}`)
    lines.push(`  User / User:       ${stats.conflicts.userUser}`)
    lines.push(`  Input total:       ${inputTotal}`)
    lines.push('Conflicts — output (this run\'s own result — determines pass/fail):')
    lines.push(`  vs. Existing:      ${stats.conflicts.outputVsExisting}`)
    lines.push(`  vs. Generated:     ${stats.conflicts.outputVsGenerated}`)
    lines.push(`  Output total:      ${outputTotal}`)
    lines.push('')
  }

  const issues = result.validation?.issues ?? []
  lines.push(`Issues (${issues.length}):`)
  if (issues.length === 0) {
    lines.push('  None.')
  } else {
    for (const issue of issues) {
      const where = issue.action ? `${issue.action} (${issue.mapName})` : ''
      lines.push(`  [${issue.severity.toUpperCase()}]${where ? ' ' + where : ''}: ${issue.message}`)
    }
  }

  return lines.join('\n') + '\n'
}
