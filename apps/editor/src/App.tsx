import { CapabilityGate } from "@/ui/CapabilityGate"
import { EditorLayout } from "@/ui/EditorLayout"
import { ProjectList } from "@/ui/ProjectList"
import { useEditor } from "@/store"

export function App() {
  const open = useEditor((state) => state.project !== null)

  return <CapabilityGate>{open ? <EditorLayout /> : <ProjectList />}</CapabilityGate>
}

export default App
