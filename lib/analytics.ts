// Lightweight analytics for the preview flow
// No external dependencies - just console events + future pluggable listeners

export type AnalyticsEvent =
  | { name: "preview.upload_started"; payload: { mime: string; sizeBytes: number } }
  | { name: "preview.temp_ready"; payload: { session: string; msSinceUpload: number } }
  | { name: "preview.processing_started"; payload: { session: string } }
  | { name: "preview.final_ready"; payload: { session: string; msSinceUpload: number } }
  | { name: "preview.processing_failed"; payload: { session: string; error: string } }
  | { name: "preview.size_selected"; payload: { sizeId: string } }
  | { name: "preview.cta_shown"; payload: { session: string } }
  | { name: "preview.cta_clicked"; payload: { session: string; sizeId?: string } }
  | { name: "preview.reset"; payload: {} }

interface AnalyticsListener {
  (event: AnalyticsEvent): void
}

class AnalyticsCollector {
  private listeners = new Set<AnalyticsListener>()
  private history: AnalyticsEvent[] = []

  track(event: AnalyticsEvent): void {
    this.history.push(event)
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // No-op - listeners shouldn't crash the flow
      }
    }
  }

  subscribe(listener: AnalyticsListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getHistory(): ReadonlyArray<AnalyticsEvent> {
    return this.history
  }

  clear(): void {
    this.history = []
  }
}

// Singleton instance
export const analytics = new AnalyticsCollector()
