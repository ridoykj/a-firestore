import { useEffect, useMemo, useRef } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { IDisposable, editor as MonacoEditor } from "monaco-editor"
import type { PreviewEditorTheme, PreviewValidationSummary } from "@/features/firestore/schemas/FirestoreSchema"
import { cn } from "@/shadcn/lib/utils"

type FirestoreJsonCodeEditorProps = {
  className?: string
  value: string
  onChange: (value: string) => void
  theme: PreviewEditorTheme
  modelPath: string
  formatRequestVersion: number
  onValidationChange: (summary: PreviewValidationSummary) => void
  disabled?: boolean
}

const EMPTY_VALIDATION: PreviewValidationSummary = {
  errorCount: 0,
  warningCount: 0,
  firstErrorMessage: "",
}

function buildValidationSummary(markers: MonacoEditor.IMarker[]): PreviewValidationSummary {
  let errorCount = 0
  let warningCount = 0
  let firstErrorMessage = ""

  for (const marker of markers) {
    if (marker.severity >= 8) {
      errorCount += 1
      if (!firstErrorMessage) {
        firstErrorMessage = `Line ${marker.startLineNumber}:${marker.startColumn} - ${marker.message}`
      }
      continue
    }

    if (marker.severity >= 4) {
      warningCount += 1
    }
  }

  return {
    errorCount,
    warningCount,
    firstErrorMessage,
  }
}

export function FirestoreJsonCodeEditor({
  className,
  value,
  onChange,
  theme,
  modelPath,
  formatRequestVersion,
  onValidationChange,
  disabled = false,
}: FirestoreJsonCodeEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decorationListenerRef = useRef<IDisposable | null>(null)

  const editorTheme = theme === "dark" ? "vs-dark" : "vs"
  const editorPath = useMemo(() => {
    const normalized = modelPath.trim().replace(/[^a-zA-Z0-9/_-]+/g, "_")
    return `inmemory://firestore/${normalized || "document"}.json`
  }, [modelPath])

  useEffect(() => {
    return () => {
      decorationListenerRef.current?.dispose()
      decorationListenerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (formatRequestVersion === 0 || !editorRef.current) {
      return
    }

    const action = editorRef.current.getAction("editor.action.formatDocument")
    if (!action) {
      return
    }

    void action.run()
  }, [formatRequestVersion])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      allowTrailingCommas: false,
      enableSchemaRequest: false,
    })

    const emitValidation = () => {
      const model = editor.getModel()
      if (!model) {
        onValidationChange(EMPTY_VALIDATION)
        return
      }
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
      onValidationChange(buildValidationSummary(markers))
    }

    decorationListenerRef.current?.dispose()
    decorationListenerRef.current = editor.onDidChangeModelDecorations(emitValidation)
    emitValidation()
  }

  return (
    <div className={cn("flex min-h-0 flex-1 overflow-hidden rounded-md border", className)}>
      <Editor
        path={editorPath}
        height="100%"
        language="json"
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        onMount={handleMount}
        theme={editorTheme}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          folding: true,
          formatOnType: true,
          formatOnPaste: true,
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: false,
          readOnly: disabled,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          renderValidationDecorations: "on",
          lineNumbersMinChars: 3,
          glyphMargin: false,
          quickSuggestions: false,
        }}
        saveViewState
      />
    </div>
  )
}
