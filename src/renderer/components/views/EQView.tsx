import { useState } from 'react'
import EQPanel from '../eq/EQPanel'
import { useEQStore } from '../../stores/eqStore'
import { EQBand } from '../../types/audio'
import { useAiSettingsStore } from '../../stores/aiSettingsStore'

export default function EQView() {
  const [aiPrompt, setAiPrompt] = useState('')
  const [autoEqQuery, setAutoEqQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const importPreset = useEQStore(s => s.importPreset)
  const { settings: { provider, apiKey } } = useAiSettingsStore()

  const handleAiSubmit = () => {
    if (!aiPrompt.trim()) return
    setIsGenerating(true)
    window.electronAPI.ai.generateEqProfile(aiPrompt, {}, { provider, apiKey }).then((result: any) => {
      const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      const bands: EQBand[] = freqs.map((f, i) => ({
        id: `ai-${f}`,
        type: 'peaking',
        frequency: f,
        gain: result.gains[i] || 0,
        Q: 1.41
      }))
      
      importPreset({
        id: `ai-preset-${Date.now()}`,
        name: result.name || 'AI Assistant',
        preamp: result.preamp || 0,
        bands,
        isCustom: true
      })
    })
  }

  const handleAutoEqSearch = () => {
    if (!autoEqQuery.trim()) return
    // AutoEQ fetch not implemented yet
    alert("AutoEQ fetching is not yet wired up. In a real scenario, this would query the AutoEQ API for '" + autoEqQuery + "'.")
  }

  return (
    <div className="eq-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexShrink: 0 }}>
        {/* AI Assistant */}
        <div className="eq-ai-assistant" style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>AI EQ Assistant</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Describe your desired sound (e.g. 'More bass, warm vocals')"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
            />
            <button onClick={handleAiSubmit} style={{ padding: '0.5rem 1rem', borderRadius: '4px', background: '#3b82f6', border: 'none', color: 'white', cursor: 'pointer' }}>
              Generate
            </button>
          </div>
        </div>

        {/* AutoEQ Search */}
        <div className="eq-autoeq-search" style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>AutoEQ Search</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Search headphone models..."
              value={autoEqQuery}
              onChange={(e) => setAutoEqQuery(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
              onKeyDown={(e) => e.key === 'Enter' && handleAutoEqSearch()}
            />
            <button onClick={handleAutoEqSearch} style={{ padding: '0.5rem 1rem', borderRadius: '4px', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer' }}>
              Search
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <EQPanel />
      </div>
    </div>
  )
}
