export type ActivationMode =
  | 'press'
  | 'hold'
  | 'hold_no_retrigger'
  | 'release'
  | 'tap'
  | 'hold_toggle'
  | 'smart_toggle'
  | 'double_tap'

export type BindingSource = 'cig' | 'user' | 'generated'

export interface Binding {
  device: 'keyboard' | 'mouse' | 'joystick' | 'gamepad'
  input: string        // e.g. "lshift+f1"
  modifiers: string[]  // e.g. ["lshift"]
  key: string          // e.g. "f1"
  source: BindingSource
}

export interface SCAction {
  name: string
  label: string        // CIG UILabel on the action element
  description: string
  mapName: string      // e.g. "spaceship_movement"
  mapLabel: string     // CIG UILabel on the actionmap element
  mapCategory: string  // CIG UICategory on the actionmap element
  activationMode: ActivationMode
  isToggleCandidate: boolean
  bindings: {
    keyboard: Binding | null
    mouse: Binding | null
    joystick: Binding | null
    gamepad: Binding | null
  }
}

export interface ActionMap {
  name: string
  label: string        // CIG UILabel
  category: string     // CIG UICategory
  actions: SCAction[]
}

export interface ParsedBindings {
  scVersion: string
  actionMaps: ActionMap[]
  defaultBoundCount: number  // actions with a CIG default keyboard bind, captured pre-overlay
  userBoundCount: number     // distinct actions the user's actionmaps.xml explicitly touches
}

// Groups of simultaneously-active actionmap contexts.
// Actions within the same group cannot share a key+modifier combo.
export type GroupName = 'spaceship_vehicles' | 'foot' | 'ui'

export interface GeneratedBind {
  actionName: string
  mapName: string
  input: string        // e.g. "lshift+f1"
  flagForTesting: boolean  // true if uses rshift or rctrl
}
