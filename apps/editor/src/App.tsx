// The whole app: a gate, and the two screens behind it.
//
// The gate comes first and renders nothing else when the browser is unsupported (FR-023). Behind
// it, `screen` is the only thing that decides what is on show — the Project list when no Project is
// open, which is where the app lands on arrival and after every reload, and the editor shell once
// one is.

import { CapabilityGate } from "@/ui/CapabilityGate"
import { EditorLayout } from "@/ui/EditorLayout"
import { ProjectList } from "@/ui/ProjectList"
import { useEditorStore } from "@/store"

export function App() {
  const screen = useEditorStore((state) => state.screen)

  return <CapabilityGate>{screen === "editor" ? <EditorLayout /> : <ProjectList />}</CapabilityGate>
}

export default App
