// Keybind rules and data — single source of truth. See docs/keybinds.md for system-level rationale.

import type { GroupName } from './types.js'

// Tried in order; earlier = preferred. All are DirectInput scan codes (layout-neutral).
export const CANDIDATE_KEYS: string[] = [
  // T1 — Letters
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
  // T2 — Number row
  '1','2','3','4','5','6','7','8','9','0',
  // T3 — Punctuation
  'minus','equals','lbracket','rbracket','backslash','semicolon','apostrophe','grave','comma','period','slash',
  // T4 — Function keys
  'f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12',
  // T5 — Numpad (works even without physical numpad — Stream Deck can send these)
  'np_0','np_1','np_2','np_3','np_4','np_5','np_6','np_7','np_8','np_9',
  'np_period','np_divide','np_multiply','np_subtract','np_add','np_enter',
  // T6 — Navigation cluster
  'insert','delete','home','end','pgup','pgdn',
  // T7 — Arrows
  'up','down','left','right',
]

// All 32 modifier combinations (2⁵), P1–P32 per rules doc.
// Generator iterates in order, picks first available slot.
// ⚠️ = flag for hardware testing  🔴 = AltGr risk on EU keyboards
export const MODIFIER_PRIORITY: string[][] = [
  [],                                              // P1
  ['lshift'],                                      // P2
  ['lctrl'],                                       // P3  (skip for foot context)
  ['lalt'],                                        // P4
  ['rshift'],                                      // P5  ⚠️
  ['rctrl'],                                       // P6  ⚠️
  ['lshift','lctrl'],                              // P7
  ['lshift','lalt'],                               // P8
  ['lctrl','lalt'],                                // P9  🔴
  ['lshift','rshift'],                             // P10 ⚠️
  ['lshift','rctrl'],                              // P11 ⚠️
  ['lctrl','rshift'],                              // P12 ⚠️
  ['lctrl','rctrl'],                               // P13 ⚠️
  ['lalt','rshift'],                               // P14 ⚠️
  ['lalt','rctrl'],                                // P15 ⚠️
  ['rshift','rctrl'],                              // P16 ⚠️
  ['lshift','lctrl','lalt'],                       // P17
  ['lshift','lctrl','rshift'],                     // P18 ⚠️
  ['lshift','lctrl','rctrl'],                      // P19 ⚠️
  ['lshift','lalt','rshift'],                      // P20 ⚠️
  ['lshift','lalt','rctrl'],                       // P21 ⚠️
  ['lctrl','lalt','rshift'],                       // P22 🔴
  ['lctrl','lalt','rctrl'],                        // P23 🔴
  ['lshift','rshift','rctrl'],                     // P24 ⚠️
  ['lctrl','rshift','rctrl'],                      // P25 ⚠️
  ['lalt','rshift','rctrl'],                       // P26 ⚠️
  ['lshift','lctrl','lalt','rshift'],              // P27 🔴
  ['lshift','lctrl','lalt','rctrl'],               // P28 🔴
  ['lshift','lctrl','rshift','rctrl'],             // P29 ⚠️
  ['lshift','lalt','rshift','rctrl'],              // P30 ⚠️
  ['lctrl','lalt','rshift','rctrl'],               // P31 🔴
  ['lshift','lctrl','lalt','rshift','rctrl'],      // P32 ⚠️
]

// Binds using these modifiers are flagged in output for hardware testing
export const FLAG_FOR_TESTING = new Set(['rshift', 'rctrl'])

// lshift + these keys are force-skipped in spaceship_vehicles and foot contexts.
// lshift alone triggers boost (ships) and sprint (foot) — players hold it during
// movement, so any lshift+WASDQE combo ghost-fires. See rules doc § lshift movement exception.
export const LSHIFT_MOVEMENT_KEYS = new Set(['w','a','s','d','q','e'])

// Keys forbidden as the main key
export const FORBIDDEN_KEYS = new Set([
  'f13','f14','f15','f16','f17','f18','f19','f20','f21','f22','f23','f24',
  'contextmenu','lwin','rwin','ralt',
  'space','tab','enter','backspace','escape',
  'capslock','numlock','scrolllock',
])

// Hard deny — Windows system shortcuts. Universal, never safe to use.
const DENY_SYSTEM = [
  'lalt+f4','lalt+tab','lalt+enter','lctrl+lalt+delete','lctrl+lshift+escape',
  'lalt+f1','lalt+f2','lalt+f3','lalt+f10',
  'lctrl+insert','lshift+insert','lshift+delete',
]

// Hard deny — app shortcuts that clash during gameplay.
// These are defaults in common apps players run alongside SC.
// Players can remove entries here if they've rebound the app shortcut.
const DENY_APP_SHORTCUTS = [
  'lshift+apostrophe',  // Discord: open/close interface panel (default)
]

export const DENY_COMBOS = new Set([...DENY_SYSTEM, ...DENY_APP_SHORTCUTS])

// Soft caution — common OS/app shortcuts. Not blocked but flagged in output.
// TODO: wire into generator as soft-flag once FLAG_COMBOS mechanism exists.
export const CAUTION_COMBOS = new Set([
  'lctrl+a','lctrl+c','lctrl+f','lctrl+n','lctrl+p',
  'lctrl+q','lctrl+r','lctrl+s','lctrl+t','lctrl+v',
  'lctrl+w','lctrl+x','lctrl+y','lctrl+z',
])

// Actionmaps that are simultaneously active — actions within a group share a collision space.
// An actionmap active in multiple contexts is listed in each relevant group.
// The generator marks any combo used there as occupied across all those groups.
export const CONTEXT_GROUPS: Record<GroupName, string[]> = {
  spaceship_vehicles: [
    // Spaceship
    'seat_general','spaceship_general','spaceship_movement','spaceship_view',
    'spaceship_weapons','spaceship_missiles','spaceship_auto_weapons',
    'spaceship_defensive','spaceship_targeting','spaceship_targeting_advanced',
    'spaceship_target_hailing','spaceship_radar','spaceship_scanning',
    'spaceship_hud','spaceship_power','spaceship_quantum','spaceship_docking',
    'spaceship_mining','spaceship_salvage','spaceship_crew',
    'turret_movement','turret_advanced','lights_controller','IFCS_controls',
    // Vehicle
    'vehicle_general','vehicle_weapons','vehicle_driver','vehicle_mfd','vehicle_mobiglas',
    // Ship/vehicle tools
    'mining','tractor_beam',
    // Active in all contexts
    'default','flycam','debug','server_renderer',
    'view_director_mode','RemoteRigidEntityController',
    'player_input_optical_tracking','character_customizer',
  ],
  foot: [
    'player','player_choice','player_emotes',
    'zero_gravity_eva','zero_gravity_traversal',
    'prone','hacking','incapacitated','medical',
    // Active in all contexts
    'default','flycam','debug','server_renderer',
    'view_director_mode','RemoteRigidEntityController',
    'player_input_optical_tracking','character_customizer',
  ],
  ui: [
    'spectator','ui_cinematic',
    'mapui','ui_notification','ui_textfield',
    'pc_conversation_option_select','stopwatch',
    // Active in all contexts
    'default','flycam','debug','server_renderer',
    'view_director_mode','RemoteRigidEntityController',
    'player_input_optical_tracking','character_customizer',
  ],
}

// Canonical combo string — modifiers sorted so order of declaration doesn't matter
export function comboKey(modifiers: string[], key: string): string {
  return modifiers.length === 0 ? key : [...modifiers].sort().join('+') + '+' + key
}

// Returns all context groups an actionmap belongs to.
// An actionmap in multiple groups is simultaneously active in all of them.
// Warns if an actionmap isn't classified — add it to CONTEXT_GROUPS.
export function getGroups(mapName: string): GroupName[] {
  const groups: GroupName[] = []
  for (const [group, maps] of Object.entries(CONTEXT_GROUPS) as [GroupName, string[]][]) {
    if (maps.includes(mapName)) groups.push(group)
  }
  if (groups.length === 0) {
    // Intentional dev-console diagnostic, not a user-facing log — doesn't need SD's logger.
    console.warn(`[config] Unclassified actionmap: "${mapName}" — add to CONTEXT_GROUPS`)
  }
  return groups
}
