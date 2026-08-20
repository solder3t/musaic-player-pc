import { useState, useRef, useEffect } from 'react'
import EQPanel from '../eq/EQPanel'
import { useEQStore } from '../../stores/eqStore'
import { EQBand } from '../../types/audio'
import { useAiSettingsStore } from '../../stores/aiSettingsStore'
import { parseAutoEQ } from '../../utils/autoEQParser'

// Cache version — bump this when the parsing logic changes to force a refresh.
const AUTOEQ_CACHE_VERSION = 2
let autoEqIndexCache: { name: string, path: string }[] | null = null;
let autoEqIndexCacheVersion = 0;

export default function EQView() {
  const [aiPrompt, setAiPrompt] = useState('')
  
  // AutoEQ States
  const [autoEqQuery, setAutoEqQuery] = useState('')
  const [autoEqResults, setAutoEqResults] = useState<{name: string, path: string}[]>([])
  const [isSearchingAutoEq, setIsSearchingAutoEq] = useState(false)
  const [isDropdownVisible, setIsDropdownVisible] = useState(false)

  const importPreset = useEQStore(s => s.importPreset)
  const { settings: { provider, apiKey, model, serverUrl } } = useAiSettingsStore()
  
  // Debounce search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  const handleAiSubmit = () => {
    if (!aiPrompt.trim()) return

    window.electronAPI.ai.generateEqProfile(aiPrompt, {}, { provider, apiKey, model, serverUrl }).then((result: any) => {
      const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      const bands: EQBand[] = freqs.map((f, i) => ({
        id: `ai-${f}`,
        type: 'peaking',
        frequency: f,
        gain: result.gains[i] || 0,
        Q: 1.41
      }))
      
      const rawName = result.name || 'Generated EQ'
      const presetName = rawName.startsWith('AI ') ? rawName : `AI ${rawName}`
      importPreset({
        id: `ai-preset-${Date.now()}`,
        name: presetName,
        preamp: result.preamp || 0,
        bands,
        isCustom: true
      })
    }).catch((err: unknown) => {
      console.error('[AI EQ] Failed to generate profile:', err)
      alert('AI EQ generation failed. Check your API key in Settings.')
    })
  }

  const handleAutoEqSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch ?? autoEqQuery).trim().toLowerCase()
    if (!q) {
      setAutoEqResults([])
      setIsDropdownVisible(false)
      return
    }
    
    setIsSearchingAutoEq(true)
    try {
      if (!autoEqIndexCache || autoEqIndexCacheVersion !== AUTOEQ_CACHE_VERSION) {
        const res = await fetch('https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/INDEX.md');
        const text = await res.text();
        // Parse line by line. Each line looks like:
        //   - [Model Name](./path/to/Model%20Name) by source on rig
        // Paths can contain literal ( and ) so we split each line on ') by ' to isolate
        // the markdown link before parsing, avoiding regex stopping at inner parens.
        const results: { name: string, path: string }[] = [];
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('- [')) continue;
          // Find the name: between '- [' and ']('
          const nameEnd = trimmed.indexOf('](');
          if (nameEnd === -1) continue;
          const name = trimmed.slice(3, nameEnd);
          // Find the path: between './'' and the next ')' that closes the markdown link.
          // The markdown link ends at the last ')' before ' by ' (or end of line).
          const linkStart = trimmed.indexOf('(./', nameEnd);
          if (linkStart === -1) continue;
          // Take everything after '(./' — then find the last ')' which closes the link
          const afterLinkOpen = trimmed.slice(linkStart + 3); // skip '(./'  
          // The link closes at a ')' followed by ' by ' or end of string
          // Use lastIndexOf of ') by ' first, fall back to lastIndexOf(')')
          const byMarker = afterLinkOpen.lastIndexOf(') by ');
          const path = byMarker !== -1
            ? afterLinkOpen.slice(0, byMarker)
            : afterLinkOpen.slice(0, afterLinkOpen.lastIndexOf(')'));
          if (path) results.push({ name, path });
        }
        autoEqIndexCache = results;
        autoEqIndexCacheVersion = AUTOEQ_CACHE_VERSION;
      }

      const matches = autoEqIndexCache.filter(item => item.name.toLowerCase().includes(q)).slice(0, 50)
      setAutoEqResults(matches)
      setIsDropdownVisible(true)
    } catch (err) {
      console.error(err)
      alert("Failed to fetch AutoEQ index")
    } finally {
      setIsSearchingAutoEq(false)
    }
  }

  const handleAutoEqQueryChange = (val: string) => {
    setAutoEqQuery(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    
    if (val.trim().length > 2) {
      searchTimeoutRef.current = setTimeout(() => {
        handleAutoEqSearch(val)
      }, 300)
    } else {
      setAutoEqResults([])
      setIsDropdownVisible(false)
    }
  }

  const handleSelectAutoEq = async (item: {name: string, path: string}) => {
    setIsDropdownVisible(false)
    setAutoEqQuery(item.name)
    try {
      // item.path is already URL-encoded from INDEX.md (e.g. "crinacle/711%20in-ear/Sony%20WH-1000XM5")
      // Use item.name to build the filename - encode spaces as %20 but preserve other special chars
      // that GitHub Raw accepts unencoded (like parentheses).
      const encodedName = item.name
        .split('')
        .map(c => c === ' ' ? '%20' : c)
        .join('');
      const eqUrl = `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/${item.path}/${encodedName}%20ParametricEQ.txt`;
      
      console.log('[AutoEQ] Fetching:', eqUrl);
      const res = await fetch(eqUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${eqUrl}`);
      const content = await res.text();
      const preset = parseAutoEQ(content, item.name);
      
      importPreset({
        ...preset,
        id: `autoeq-${Date.now()}`,
        isCustom: true
      });
    } catch (err) {
      console.error('[AutoEQ] Error:', err);
      alert("Failed to load AutoEQ profile.");
    }
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
        <div className="eq-autoeq-search" style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '8px', position: 'relative' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>AutoEQ Search</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Search headphone models..."
              value={autoEqQuery}
              onChange={(e) => handleAutoEqQueryChange(e.target.value)}
              onFocus={() => {
                if (autoEqResults.length > 0) setIsDropdownVisible(true)
              }}
              onBlur={() => setTimeout(() => setIsDropdownVisible(false), 200)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
              onKeyDown={(e) => e.key === 'Enter' && handleAutoEqSearch()}
            />
            <button onClick={() => handleAutoEqSearch()} disabled={isSearchingAutoEq} style={{ padding: '0.5rem 1rem', borderRadius: '4px', background: '#10b981', border: 'none', color: 'white', cursor: 'pointer', opacity: isSearchingAutoEq ? 0.7 : 1 }}>
              {isSearchingAutoEq ? '...' : 'Search'}
            </button>
          </div>
          
          {isDropdownVisible && autoEqResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: '1rem', right: '1rem', maxHeight: '200px', overflowY: 'auto', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', zIndex: 10, marginTop: '4px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}>
              {autoEqResults.map((item, i) => (
                <div 
                  key={i} 
                  onClick={() => handleSelectAutoEq(item)}
                  style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderBottom: i < autoEqResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ fontSize: '0.9rem', color: 'white' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{decodeURIComponent(item.path).split('/')[0]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <EQPanel />
      </div>
    </div>
  )
}
