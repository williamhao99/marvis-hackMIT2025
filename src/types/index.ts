export interface InstructionStep {
  id: number
  title: string
  description: string
  details?: string[]
  tips?: string
  diagram?: string[]
}

export interface Project {
  id: string
  name: string
  totalSteps: number
  steps: InstructionStep[]
  source: 'hardcoded' | 'barcode' | 's3'
}

export type AppState = 'welcome' | 'selecting' | 'building' | 'completed'

export interface SessionState {
  currentProject: Project | null
  currentStep: number
  state: AppState
}

export interface BarcodeResult {
  barcode: string
  format?: string
  confidence?: number
}

export interface ManualSearchResult {
  title: string
  url: string
  snippet?: string
  confidence?: number
}
