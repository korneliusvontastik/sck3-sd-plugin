import type { SCAction, GeneratedBind, GroupName } from './types.js'
import { FORBIDDEN_KEYS, DENY_COMBOS, FLAG_FOR_TESTING, comboKey, getGroups } from './config.js'

export type ValidationIssue = {
  severity: 'error' | 'warning' | 'info'
  action: string
  mapName: string
  message: string
  // Only set on actual conflict issues — which side(s) of the merge are responsible.
  // 'default': both sides are still-untouched CIG defaults. 'user': at least one side is a user
  // rebind (and no generated bind is involved). 'generated': at least one side is a bind our own
  // generator produced.
  kind?: 'default' | 'user' | 'generated'
}

export type GeneratedValidationResult = {
  valid: boolean
  issues: ValidationIssue[]
}

export type FinalValidationResult = {
  valid: boolean
  issues: ValidationIssue[]
  stats: {
    total: number
    defaultBound: number
    userBound: number
    fromCig: number
    fromUser: number
    generated: number
    filled: number
    unbound: number
    flaggedForTesting: number
    conflicts: {
      defaultDefault: number
      userDefault: number
      userUser: number
      outputVsExisting: number
      outputVsGenerated: number
      total: number
    }
  }
}

// ─── Validator 1: generated binds only ───────────────────────────────────────
//
// Checks that every bind our generator produced:
// - uses no forbidden key
// - uses no denied combo
// - does not collide with any existing bind (cig or user) in the same context group
//
// Does NOT check CIG's own pre-existing state — that's Validator 2's job.

export function validateGenerated(
  allActions: SCAction[],
  generated: GeneratedBind[],
): GeneratedValidationResult {
  const issues: ValidationIssue[] = []

  // Build occupancy from existing (cig + user) binds
  const occupancy = new Map<GroupName, Map<string, string>>() // group → combo → actionName
  for (const action of allActions) {
    const kb = action.bindings.keyboard
    if (!kb) continue
    const combo = comboKey(kb.modifiers, kb.key)
    for (const group of getGroups(action.mapName)) {
      if (!occupancy.has(group)) occupancy.set(group, new Map()) // set() on the line above guarantees this
      occupancy.get(group)!.set(combo, `${action.mapName}/${action.name}`)
    }
  }

  const generatedOccupancy = new Map<GroupName, Map<string, string>>()

  for (const bind of generated) {
    const parts = bind.input.split('+')
    const key = parts.at(-1)! // split() always yields at least one element
    const modifiers = parts.slice(0, -1)
    const combo = comboKey(modifiers, key)
    const groups = getGroups(bind.mapName)

    // Forbidden key check
    if (FORBIDDEN_KEYS.has(key)) {
      issues.push({ severity: 'error', action: bind.actionName, mapName: bind.mapName, message: `Forbidden key: ${key}` })
    }

    // Denied combo check
    if (DENY_COMBOS.has(combo)) {
      issues.push({ severity: 'error', action: bind.actionName, mapName: bind.mapName, message: `Denied combo: ${combo}` })
    }

    // Clash with existing (cig/user) binds
    for (const group of groups) {
      const existing = occupancy.get(group)?.get(combo)
      if (existing) {
        issues.push({ severity: 'error', action: bind.actionName, mapName: bind.mapName, message: `Clashes with existing bind ${combo} (${existing}) in group "${group}"` })
      }
    }

    // Clash with other generated binds in same group
    for (const group of groups) {
      if (!generatedOccupancy.has(group)) generatedOccupancy.set(group, new Map())
      const existing = generatedOccupancy.get(group)!.get(combo)
      if (existing) {
        issues.push({ severity: 'error', action: bind.actionName, mapName: bind.mapName, message: `Generated collision: ${combo} already assigned to ${existing} in group "${group}"` })
      } else {
        generatedOccupancy.get(group)!.set(combo, `${bind.mapName}/${bind.actionName}`)
      }
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  }
}

// ─── Validator 2: final full-picture report ───────────────────────────────────
//
// Runs after generation is complete. Reports on the full merged state:
// - Coverage: every action has a keyboard bind
// - CIG pre-existing collisions (warn — not our problem, but good to know)
// - Generated collision check (error — should never happen if Validator 1 passed)
// - Flagged-for-testing binds
// - Summary stats

type Occupant = { ref: string; source: 'cig' | 'user' | 'generated' }

export function validateFinal(
  allActions: SCAction[],
  generated: GeneratedBind[],
  defaultBoundCount = 0,
  userBoundCount = 0,
): FinalValidationResult {
  const issues: ValidationIssue[] = []

  // Stats — reflect true end state after generation
  const generatedNames = new Set(generated.map(g => g.actionName))
  let fromCig = 0, fromUser = 0, unbound = 0, flaggedForTesting = 0

  for (const action of allActions) {
    const kb = action.bindings.keyboard
    if (!kb) {
      if (!generatedNames.has(action.name)) unbound++
      continue
    }
    if (kb.source === 'cig') fromCig++
    else if (kb.source === 'user') fromUser++
  }
  flaggedForTesting = generated.filter(g => g.flagForTesting).length

  // Coverage check
  for (const action of allActions) {
    if (!action.bindings.keyboard && !generatedNames.has(action.name)) {
      issues.push({ severity: 'error', action: action.name, mapName: action.mapName, message: 'No keyboard bind — not covered by CIG, user, or generator' })
    }
  }

  // ─── Conflicts at input: pre-existing cig/user binds colliding with each other ───
  // One occupancy map carries through into the output pass below, so generated binds are checked
  // against this same final state.
  const occupancy = new Map<GroupName, Map<string, Occupant>>()
  let defaultDefault = 0, userDefault = 0, userUser = 0

  for (const action of allActions) {
    const kb = action.bindings.keyboard
    if (!kb || kb.source === 'generated') continue
    const combo = comboKey(kb.modifiers, kb.key)
    for (const group of getGroups(action.mapName)) {
      if (!occupancy.has(group)) occupancy.set(group, new Map()) // set() on the line above guarantees this
      const bucket = occupancy.get(group)!
      const existing = bucket.get(combo)
      if (existing) {
        const bothCig = existing.source === 'cig' && kb.source === 'cig'
        const bothUser = existing.source === 'user' && kb.source === 'user'
        const kind: ValidationIssue['kind'] = bothCig ? 'default' : 'user'
        if (bothCig) defaultDefault++
        else if (bothUser) userUser++
        else userDefault++
        issues.push({
          severity: 'warning',
          action: action.name,
          mapName: action.mapName,
          kind,
          message: `${kb.source}/${existing.source} collision: ${combo} also used by ${existing.ref} in group "${group}"`,
        })
      } else {
        bucket.set(combo, { ref: `${action.mapName}/${action.name}`, source: kb.source })
      }
    }
  }

  // ─── Conflicts for outputs only: generated binds vs. everything (existing state + each other) ───
  // The generator avoids occupied combos by construction, so these should normally be 0 — this is a
  // safety net, not an expected outcome.
  let outputVsExisting = 0, outputVsGenerated = 0

  for (const bind of generated) {
    const parts = bind.input.split('+')
    const combo = comboKey(parts.slice(0, -1), parts.at(-1)!) // split() always yields at least one element
    for (const group of getGroups(bind.mapName)) {
      if (!occupancy.has(group)) occupancy.set(group, new Map()) // set() on the line above guarantees this
      const bucket = occupancy.get(group)!
      const existing = bucket.get(combo)
      if (existing) {
        if (existing.source === 'generated') outputVsGenerated++
        else outputVsExisting++
        issues.push({
          severity: 'error',
          action: bind.actionName,
          mapName: bind.mapName,
          kind: 'generated',
          message: `Generated collision: ${combo} already assigned to ${existing.ref} (${existing.source}) in group "${group}"`,
        })
      } else {
        bucket.set(combo, { ref: `${bind.mapName}/${bind.actionName}`, source: 'generated' })
      }
    }
  }

  // Flagged-for-testing notice
  if (flaggedForTesting > 0) {
    issues.push({ severity: 'info', action: '', mapName: '', message: `${flaggedForTesting} generated bind(s) use rshift/rctrl — verify on real hardware` })
  }

  const errors = issues.filter(i => i.severity === 'error')
  const conflictTotal = defaultDefault + userDefault + userUser + outputVsExisting + outputVsGenerated

  return {
    valid: errors.length === 0,
    issues,
    stats: {
      total: allActions.length,
      defaultBound: defaultBoundCount,
      userBound: userBoundCount,
      fromCig,
      fromUser,
      generated: generated.length,
      filled: allActions.length - unbound,
      unbound,
      flaggedForTesting,
      conflicts: {
        defaultDefault,
        userDefault,
        userUser,
        outputVsExisting,
        outputVsGenerated,
        total: conflictTotal,
      },
    },
  }
}

// Legacy export — kept for existing tests
export function validate(
  allActions: SCAction[],
  generated: GeneratedBind[],
): { valid: boolean; issues: ValidationIssue[]; flaggedForTesting: GeneratedBind[] } {
  const r1 = validateGenerated(allActions, generated)
  const r2 = validateFinal(allActions, generated)
  return {
    valid: r1.valid && r2.valid,
    issues: [...r1.issues, ...r2.issues],
    flaggedForTesting: generated.filter(g => g.flagForTesting),
  }
}

export type { ValidationIssue as ValidationResult }
