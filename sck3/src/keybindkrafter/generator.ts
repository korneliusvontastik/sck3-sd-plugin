import type { SCAction, GeneratedBind, GroupName } from './types.js'
import {
  CANDIDATE_KEYS,
  MODIFIER_PRIORITY,
  FORBIDDEN_KEYS,
  DENY_COMBOS,
  FLAG_FOR_TESTING,
  LSHIFT_MOVEMENT_KEYS,
  comboKey,
  getGroups,
} from './config.js'

type OccupancyMap = Map<GroupName, Set<string>>

function isOccupied(occupancy: OccupancyMap, groups: GroupName[], combo: string): boolean {
  for (const group of groups) {
    if (occupancy.get(group)?.has(combo)) return true
  }
  return false
}

function markOccupied(occupancy: OccupancyMap, groups: GroupName[], combo: string): void {
  for (const group of groups) {
    if (!occupancy.has(group)) occupancy.set(group, new Set())
    occupancy.get(group)!.add(combo)
  }
}

function buildOccupancyFromExisting(actions: SCAction[]): OccupancyMap {
  const occupancy: OccupancyMap = new Map()
  for (const action of actions) {
    const groups = getGroups(action.mapName)
    const kb = action.bindings.keyboard
    if (kb) markOccupied(occupancy, groups, comboKey(kb.modifiers, kb.key))
    for (const reserved of action.reservedCombos ?? []) markOccupied(occupancy, groups, reserved)
  }
  return occupancy
}

export function generateMissingBinds(actions: SCAction[]): GeneratedBind[] {
  const occupancy = buildOccupancyFromExisting(actions)
  const results: GeneratedBind[] = []
  const unbound = actions.filter(a => a.bindings.keyboard === null && !a.isAxisAction)

  for (const action of unbound) {
    const groups = getGroups(action.mapName)
    let assigned = false

    outer:
    for (const modifiers of MODIFIER_PRIORITY) {
      // On-foot rule: lctrl is physically occupied by crouch/prone — skip for foot group
      if (groups.includes('foot') && modifiers.includes('lctrl')) continue

      for (const key of CANDIDATE_KEYS) {
        if (FORBIDDEN_KEYS.has(key)) continue

        // lshift + movement key exception: boost/sprint is held during movement in these contexts
        if (
          modifiers.includes('lshift') &&
          LSHIFT_MOVEMENT_KEYS.has(key) &&
          (groups.includes('spaceship_vehicles') || groups.includes('foot'))
        ) continue

        const combo = comboKey(modifiers, key)

        if (DENY_COMBOS.has(combo)) continue
        if (isOccupied(occupancy, groups, combo)) continue

        markOccupied(occupancy, groups, combo)
        results.push({
          actionName: action.name,
          mapName: action.mapName,
          input: combo,
          flagForTesting: modifiers.some(m => FLAG_FOR_TESTING.has(m)),
        })
        assigned = true
        break outer
      }
    }

    if (!assigned) {
      // Intentional dev-console diagnostic, not a user-facing log — doesn't need SD's logger.
      console.warn(`[generator] No combo available for action: ${action.mapName}/${action.name}`)
    }
  }

  return results
}
