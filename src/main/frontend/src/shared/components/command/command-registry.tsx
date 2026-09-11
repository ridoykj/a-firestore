/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/shadcn/components/ui/command"
import { eventToShortcut, isEditableTarget } from "@/shared/lib/keyboard"

export type AppCommand = {
  id: string
  label: string
  group?: string
  /** Normalized shortcut, e.g. "mod+enter". "mod" is Cmd on macOS, Ctrl elsewhere. */
  shortcut?: string
  /** Human-readable shortcut hint shown in the palette. */
  shortcutLabel?: string
  keywords?: string
  run: () => void
}

type CommandRegistryContextValue = {
  register: (scope: string, commands: AppCommand[]) => void
  unregister: (scope: string) => void
  openPalette: () => void
}

const CommandRegistryContext = React.createContext<CommandRegistryContextValue | null>(null)

export function CommandRegistryProvider({ children }: { children: React.ReactNode }) {
  const [scopes, setScopes] = React.useState<Record<string, AppCommand[]>>({})
  const [open, setOpen] = React.useState(false)

  const register = React.useCallback((scope: string, commands: AppCommand[]) => {
    setScopes((prev) => ({ ...prev, [scope]: commands }))
  }, [])

  const unregister = React.useCallback((scope: string) => {
    setScopes((prev) => {
      const next = { ...prev }
      delete next[scope]
      return next
    })
  }, [])

  const openPalette = React.useCallback(() => setOpen(true), [])

  // Flatten registered commands from state (no refs read during render).
  const commands = Object.values(scopes).flat()

  // Global key handling: Cmd/Ctrl+K opens the palette; registered shortcuts run their command.
  // Guarded so editor/input shortcuts (e.g. Monaco) are never overridden.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return
      }
      const shortcut = eventToShortcut(event)
      if (shortcut === "mod+k") {
        event.preventDefault()
        setOpen((value) => !value)
        return
      }
      const match = commands.find((command) => command.shortcut === shortcut)
      if (match) {
        event.preventDefault()
        match.run()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [commands])

  const value: CommandRegistryContextValue = { register, unregister, openPalette }

  // Group commands for display, preserving insertion order.
  const groups = new Map<string, AppCommand[]>()
  for (const command of commands) {
    const key = command.group ?? "Commands"
    const bucket = groups.get(key) ?? []
    bucket.push(command)
    groups.set(key, bucket)
  }

  return (
    <CommandRegistryContext.Provider value={value}>
      {children}
      <CommandDialog isOpen={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          {Array.from(groups.entries()).map(([groupName, groupCommands]) => (
            <CommandGroup key={groupName} heading={groupName}>
              {groupCommands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={`${command.label} ${command.keywords ?? ""}`}
                  onSelect={() => {
                    setOpen(false)
                    command.run()
                  }}
                >
                  <span>{command.label}</span>
                  {command.shortcutLabel ? (
                    <CommandShortcut>{command.shortcutLabel}</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </CommandRegistryContext.Provider>
  )
}

function useCommandRegistry(): CommandRegistryContextValue {
  const context = React.useContext(CommandRegistryContext)
  if (!context) {
    throw new Error("useCommandRegistry must be used within a CommandRegistryProvider.")
  }
  return context
}

/** Opens the command palette imperatively (e.g. from a toolbar button). */
export function useOpenCommandPalette(): () => void {
  return useCommandRegistry().openPalette
}

/**
 * Registers a set of commands under a stable scope while the calling component is mounted.
 * `run` closures stay fresh via a ref, so callers can pass inline handlers each render without
 * re-registering; the palette metadata refreshes only when the command id list changes.
 */
export function useRegisterCommands(scope: string, commands: AppCommand[]): void {
  const { register, unregister } = useCommandRegistry()
  const commandsRef = React.useRef(commands)

  React.useEffect(() => {
    commandsRef.current = commands
  })

  const idKey = commands.map((command) => command.id).join("|")

  React.useEffect(() => {
    const proxied = commandsRef.current.map((command) => ({
      ...command,
      run: () => {
        const latest = commandsRef.current.find((entry) => entry.id === command.id)
        latest?.run()
      },
    }))
    register(scope, proxied)
    return () => unregister(scope)
    // Re-register only when the set of command ids (or scope) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, idKey, register, unregister])
}
