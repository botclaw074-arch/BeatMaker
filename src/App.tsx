import { useState, useEffect, useCallback, useRef } from 'react'
import { audioEngine } from './audio/engine'
import { getAISuggestion, type AISuggestion } from './ai/suggestion'
import type { MelodyTrack, Note, Project } from './shared/types'

const createEmptyProject = (): Project => ({
  version: '1.0',
  name: 'Untitled',
  bpm: 120,
  timeSignature: '4/4',
  tracks: {
    melody: { notes: [] },
    bass: { notes: [] },
    drums: { kit: 'default', pattern: Array(3).fill(null).map(() => Array(16).fill(0)) },
    chords: []
  }
})

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const getNoteName = (pitch: number) => noteNames[pitch % 12] + String(Math.floor(pitch / 12) - 1)
const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12)

interface TrackState {
  id: string
  name: string
  type: 'melody' | 'drums' | 'chords' | 'bass'
  muted: boolean
  solo: boolean
  volume: number
  pan: number
  color: string
}

interface Clip {
  id: string
  trackId: string
  startBar: number
  duration: number
  color: string
  data: any
}

interface AIThought {
  id: number
  text: string
}

const trackColors = ['#00a8e8', '#ff6b6b', '#feca57', '#48dbfb']

const genrePresets: Record<string, { scale: number[], chordProgression: string[], drumPattern: number[][] }> = {
  pop: {
    scale: [60, 62, 64, 65, 67, 69, 71, 72],
    chordProgression: ['C', 'G', 'Am', 'F'],
    drumPattern: [[1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]]
  },
  edm: {
    scale: [60, 62, 64, 67, 70, 72],
    chordProgression: ['C', 'F', 'G', 'C'],
    drumPattern: [[1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]]
  },
  lofi: {
    scale: [60, 62, 63, 65, 67, 70, 72],
    chordProgression: ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    drumPattern: [[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1]]
  },
  trap: {
    scale: [58, 60, 62, 63, 66, 70, 72],
    chordProgression: ['Cm', 'Ab', 'Bb', 'Gm'],
    drumPattern: [[1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1]]
  },
  rock: {
    scale: [60, 62, 64, 65, 67, 69, 71, 72],
    chordProgression: ['G', 'C', 'D', 'G'],
    drumPattern: [[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]]
  }
}

type ViewMode = 'pattern' | 'arrange' | 'mix' | 'flow'
type SelectionType = 'none' | 'track' | 'note' | 'drum'

export default function App() {
  const [project, setProject] = useState<Project>(createEmptyProject())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [totalBars, setTotalBars] = useState(4)
  const [apiKey, setApiKey] = useState('')
  const [isLoadingKey, setIsLoadingKey] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [volume, setVolume] = useState(0.7)
  
  // View modes
  const [view, setView] = useState<ViewMode>('pattern')
  const [zoom, setZoom] = useState(1)
  
  // Smart context panels
  const [selectionType, setSelectionType] = useState<SelectionType>('none')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>('melody')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  
  // UI panels
  const [showSounds, setShowSounds] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [showHotkeys, setShowHotkeys] = useState(false)
  const [errorModal, setErrorModal] = useState<{title: string; message: string} | null>(null)
  const [isLooping, setIsLooping] = useState(true)
  const [isMetronomeOn, setIsMetronomeOn] = useState(false)
  
  // AI
  const [aiThoughts, setAiThoughts] = useState<AIThought[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [genre, setGenre] = useState('pop')
  const [autoGenerate, setAutoGenerate] = useState(false)
  
  // Clip data for arrangement view
  const [clips, setClips] = useState<Clip[]>([])
  
  // Quantize
  const [quantize, setQuantize] = useState(16)
  
  // Command palette
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  
  // Intent input (type what you want)
  const [intentInput, setIntentInput] = useState('')
  
  // Audio routing for signal flow visualization
  const [audioRouting, setAudioRouting] = useState({
    melody: { volume: 0.8, pan: 0, muted: false, effects: ['reverb'] },
    bass: { volume: 0.8, pan: 0, muted: false, effects: [] },
    drums: { volume: 0.9, pan: 0, muted: false, effects: [] },
    chords: { volume: 0.6, pan: 0, muted: false, effects: ['reverb'] }
  })
  
  // Frequency visualizer data
  const [frequencyBars, setFrequencyBars] = useState<number[]>(Array(32).fill(0))
  
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)

  const chordOptions = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const modes = ['major', 'minor'] as const
  const waveforms: OscillatorType[] = ['sawtooth', 'triangle', 'square', 'sine']
  const drumKits = ['default', 'electro', 'acoustic', '808']
  const genres = Object.keys(genrePresets)

  const [currentKey, setCurrentKey] = useState('C')
  const [currentMode, setCurrentMode] = useState<typeof modes[number]>('major')
  const [synthWave, setSynthWave] = useState<OscillatorType>('sawtooth')
  const [drumKit, setDrumKit] = useState('default')
  const [reverbAmount, setReverbAmount] = useState(0.18)
  const [noteVelocity, setNoteVelocity] = useState(100)
  
  // Drag-to-paint state
  const [isDragging, setIsDragging] = useState(false)
  const [dragPitch, setDragPitch] = useState<number | null>(null)
  
  // Clip drag state for arrangement view
  const [draggingClip, setDraggingClip] = useState<string | null>(null)
  const [dragOffsetX, setDragOffsetX] = useState(0)
  
  const startOctave = 3
  const endOctave = 6
  const totalRows = (endOctave - startOctave + 1) * 12

  const getTrackNotes = useCallback((trackId: string) => {
    if (trackId === 'bass') {
      return project.tracks.bass?.notes ?? []
    }
    return project.tracks.melody.notes
  }, [project.tracks])

  const [tracks, setTracks] = useState<TrackState[]>([
    { id: 'melody', name: 'Synth', type: 'melody', muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[0] },
    { id: 'bass', name: 'Bass', type: 'bass', muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[3] },
    { id: 'drums', name: 'Drums', type: 'drums', muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[1] },
    { id: 'chords', name: 'Pad', type: 'chords', muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[2] }
  ])

  useEffect(() => {
    const loadApiKey = async () => {
      if (window.electronAPI) {
        const savedKey = await window.electronAPI.storeGet('openrouter_api_key')
        if (savedKey) setApiKey(savedKey)
      }
      setIsLoadingKey(false)
    }
    loadApiKey()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      // Handle Ctrl+Shift combinations first
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'm':
            e.preventDefault()
            setIsMetronomeOn(v => !v)
            addAIThought(isMetronomeOn ? '🔇 Metronome off' : '♩ Metronome on')
            break
          default:
            break
        }
        return
      }
      
      // Ctrl/Cmd + key combinations
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'k':
            e.preventDefault()
            setShowCommandPalette(v => !v)
            setCommandQuery('')
            break
          case 's':
            e.preventDefault()
            exportProject()
            addAIThought('💾 Project saved')
            break
          case 'l':
            e.preventDefault()
            setIsLooping(v => !v)
            addAIThought(isLooping ? '➡️ Loop disabled' : '🔁 Loop enabled')
            break
          case 'h':
            e.preventDefault()
            setShowHotkeys(v => !v)
            break
          case 'a':
            e.preventDefault()
            if (selectedTrackId !== 'chords' && selectedTrackId !== 'drums') {
              const allNotes = getTrackNotes(selectedTrackId || 'melody')
              if (allNotes.length > 0) {
                addAIThought(`✨ Selected ${allNotes.length} notes`)
              }
            }
            break
          case 'g':
            e.preventDefault()
            if (!isGenerating) {
              generateWithAI()
            }
            break
          default:
            break
        }
        return
      }
      
      // Regular key combinations
      switch (e.key) {
        case ' ':
          e.preventDefault()
          isPlaying ? handleStop() : handlePlay()
          break
        case 'Tab':
          e.preventDefault()
          setView(v => v === 'pattern' ? 'arrange' : v === 'arrange' ? 'mix' : 'pattern')
          break
        case '1':
          if (!e.metaKey && !e.ctrlKey) setSelectedTrackId('melody')
          break
        case '2':
          setSelectedTrackId('bass')
          break
        case '3':
          setSelectedTrackId('drums')
          break
        case '4':
          setSelectedTrackId('chords')
          break
        case 'm':
          if (selectedTrackId) {
            setTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, muted: !t.muted } : t))
          }
          break
        case 's':
          if (selectedTrackId) {
            setTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, solo: !t.solo } : t))
          }
          break
        case 'Delete':
        case 'Backspace':
          if (selectedNote) {
            removeNote(selectedNote.pitch, selectedNote.time)
            setSelectedNote(null)
          }
          break
        case 'q':
          setQuantize(q => q === 16 ? 8 : q === 8 ? 4 : q === 4 ? 2 : 16)
          break
        case '=':
        case '+':
          e.preventDefault()
          setProject(p => ({ ...p, bpm: Math.min(200, p.bpm + 5) }))
          addAIThought(`🎵 BPM: ${project.bpm + 5}`)
          break
        case '-':
        case '_':
          e.preventDefault()
          setProject(p => ({ ...p, bpm: Math.max(60, p.bpm - 5) }))
          addAIThought(`🎵 BPM: ${project.bpm - 5}`)
          break
        case '[':
          e.preventDefault()
          setNoteVelocity(v => Math.max(1, v - 10))
          addAIThought(`🔇 Velocity: ${Math.max(1, noteVelocity - 10)}`)
          break
        case ']':
          e.preventDefault()
          setNoteVelocity(v => Math.min(127, v + 10))
          addAIThought(`🔊 Velocity: ${Math.min(127, noteVelocity + 10)}`)
          break
        case 'h':
          setShowHotkeys(v => !v)
          break
        case 'Escape':
          setSelectedNote(null)
          setSelectionType('none')
          setShowCommandPalette(false)
          setShowHotkeys(false)
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, selectedTrackId, selectedNote, isGenerating, project.bpm, noteVelocity, getTrackNotes, isLooping, isMetronomeOn])

  const addAIThought = (text: string) => {
    const newThought: AIThought = { id: Date.now(), text }
    setAiThoughts(prev => [...prev.slice(-4), newThought])
  }

  const saveApiKey = async () => {
    if (window.electronAPI) {
      await window.electronAPI.storeSet('openrouter_api_key', apiKey)
    }
  }

  const exportProject = () => {
    const projectData = {
      version: '1.0',
      name: project.name,
      bpm: project.bpm,
      timeSignature: project.timeSignature,
      tracks: project.tracks,
      audioRouting,
      createdAt: Date.now()
    }
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/\s+/g, '_')}.beatmaker`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        setProject({
          name: data.name || 'Loaded Project',
          bpm: data.bpm || 120,
          timeSignature: data.timeSignature || '4/4',
          version: '1.0',
          tracks: data.tracks || { melody: { notes: [] }, drums: { kit: 'default', pattern: Array(3).fill(null).map(() => Array(16).fill(0)) }, chords: [] }
        })
        if (data.audioRouting) setAudioRouting(data.audioRouting)
      } catch (err) {
        console.error('Failed to load project:', err)
      }
    }
    reader.readAsText(file)
  }

  const getActiveTracks = useCallback(() => {
    const soloed = tracks.filter(t => t.solo)
    if (soloed.length > 0) return soloed
    return tracks.filter(t => !t.muted)
  }, [tracks])

  const analyzeProject = useCallback(() => {
    const melodyCount = project.tracks.melody.notes.length
    let drumActivity = 0
    project.tracks.drums.pattern.forEach(row => { row.forEach(val => { if (val) drumActivity++ }) })
    const chordCount = project.tracks.chords.length
    
    if (melodyCount === 0 && drumActivity === 0 && chordCount === 0) return 'Starting fresh - empty project'
    if (melodyCount > 8 && chordCount > 4) return 'Rich composition with melody foundation'
    if (drumActivity > 15) return 'High-energy beat with driving rhythm'
    return `Growing track: ${melodyCount} notes, ${chordCount} chords`
  }, [project])

  const generateWithAI = async () => {
    setIsGenerating(true)
    addAIThought('🎵 Analyzing project context...')
    
    const analysis = analyzeProject()
    addAIThought('📊 ' + analysis)
    
    await new Promise(r => setTimeout(r, 400))
    addAIThought('🎹 Researching ' + genre + ' patterns in key of ' + currentKey + ' ' + currentMode + '...')
    
    await new Promise(r => setTimeout(r, 400))
    addAIThought('🎤 Generating melodic ideas...')
    
    try {
      if (apiKey) {
        const suggestion = await getAISuggestion(
          apiKey,
          project.tracks.melody.notes,
          project.tracks.drums.pattern,
          project.tracks.chords,
          project.bpm,
          currentKey,
          currentMode
        )

        addAIThought('✨ Applying AI-generated music...')

        const newMelody = suggestion.melody.notes.map((n: any) => ({
          ...n,
          time: n.time + project.tracks.melody.notes.reduce((max: number, n2: any) => Math.max(max, n2.time + n2.duration), 0)
        }))

        const newChords = suggestion.chords || []

        setProject(prev => ({
          ...prev,
          tracks: {
            ...prev.tracks,
            melody: { notes: [...prev.tracks.melody.notes, ...newMelody] },
            drums: { ...prev.tracks.drums, pattern: suggestion.drums.pattern || prev.tracks.drums.pattern },
            chords: [...prev.tracks.chords, ...newChords]
          }
        }))

        setAiSuggestions([
          `Added ${newMelody.length} melodic notes`,
          `${newChords.length} chord changes`,
          `Style: ${genre} | Key: ${currentKey}`
        ])

        setTotalBars(prev => prev + 4)
      } else {
        const preset = genrePresets[genre]
        addAIThought('🎛️ Using ' + genre + ' preset...')
        
        const fallback = generateFallbackWithGenre(preset, project.tracks.melody.notes.length)
        
        await new Promise(r => setTimeout(r, 300))
        addAIThought('🎵 Generated pattern with ' + preset.scale.length + ' scale notes')
        
        const lastTime = project.tracks.melody.notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0)

        setProject(prev => ({
          ...prev,
          tracks: {
            ...prev.tracks,
            melody: { notes: [...prev.tracks.melody.notes, ...fallback.melody.notes.map(n => ({ ...n, time: n.time + lastTime }))] },
            drums: { ...prev.tracks.drums, pattern: fallback.drums.pattern },
            chords: [...prev.tracks.chords, ...fallback.chords]
          }
        }))

        setAiSuggestions([
          `Applied ${genre} scale patterns`,
          `Created ${fallback.drums.pattern[0].filter(x => x).length} drum hits`,
          `Chords: ${preset.chordProgression.join(' → ')}`
        ])

        setTotalBars(prev => prev + 4)
      }
    } catch (error: any) {
      console.error('Generation failed:', error)
      const errMsg = error?.message || error?.toString() || 'Unknown error'
      
      let title = 'Generation Failed'
      let fix = ''
      
      if (errMsg.includes('404')) {
        title = 'API Endpoint Error (404)'
        fix = 'The API endpoint may have changed. Make sure you have a valid API key.'
      } else if (errMsg.includes('401') || errMsg.includes('403')) {
        title = 'Invalid API Key'
        fix = 'Check your OpenRouter API key (starts with "sk-").'
      } else if (errMsg.includes('429')) {
        title = 'Rate Limited'
        fix = 'Wait a moment before trying again.'
      } else if (errMsg.includes('network') || errMsg.includes('fetch')) {
        title = 'Network Error'
        fix = 'Check your internet connection.'
      }
      
      setErrorModal({ title, message: errMsg + (fix ? '\n\nFix: ' + fix : '') })
      addAIThought('⚠️ Error - using fallback')
    }
    
    await new Promise(r => setTimeout(r, 500))
    addAIThought('✅ Complete! Ready for playback.')
    setIsGenerating(false)
  }

  const generateWithIntent = async (intent: string) => {
    if (!intent.trim()) return
    setIsGenerating(true)
    addAIThought(`🎯 Intent: "${intent}"`)
    
    const lowerIntent = intent.toLowerCase()
    
    if (lowerIntent.includes('bass')) {
      addAIThought('🎸 Adding bass line...')
      const preset = genrePresets[genre]
      const bassNotes = preset.scale.slice(0, 3).map((note, i) => ({
        pitch: note - 12,
        time: i * 4,
        duration: 3.5,
        velocity: 110
      }))
      setProject(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          bass: {
            notes: [...(prev.tracks.bass?.notes ?? []), ...bassNotes]
          }
        }
      }))
      addAIThought('✅ Added bass line')
    } else if (lowerIntent.includes('faster') || lowerIntent.includes('speed')) {
      const newBpm = Math.min(200, project.bpm + 20)
      setProject(prev => ({ ...prev, bpm: newBpm }))
      addAIThought(`⏩ BPM: ${project.bpm} → ${newBpm}`)
    } else if (lowerIntent.includes('slower')) {
      const newBpm = Math.max(60, project.bpm - 20)
      setProject(prev => ({ ...prev, bpm: newBpm }))
      addAIThought(`⏪ BPM: ${project.bpm} → ${newBpm}`)
    } else if (lowerIntent.includes('darker')) {
      addAIThought('🌙 Making darker...')
      setProject(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, pitch: Math.max(21, n.pitch - 2) })) }
        }
      }))
      addAIThought('✅ Shifted pitch down')
    } else if (lowerIntent.includes('brighter')) {
      addAIThought('☀️ Making brighter...')
      setProject(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, pitch: Math.min(108, n.pitch + 2) })) }
        }
      }))
      addAIThought('✅ Shifted pitch up')
    } else if (lowerIntent.includes('louder')) {
      addAIThought('🔊 Increasing volume...')
      setProject(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, velocity: Math.min(127, n.velocity + 20) })) }
        }
      }))
      addAIThought('✅ Increased velocity')
    } else if (lowerIntent.includes('quieter') || lowerIntent.includes('softer')) {
      addAIThought('🔈 Decreasing volume...')
      setProject(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, velocity: Math.max(10, n.velocity - 20) })) }
        }
      }))
      addAIThought('✅ Decreased velocity')
    } else if (lowerIntent.includes('clear')) {
      addAIThought('🧹 Clearing melody...')
      setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: [] } } }))
      addAIThought('✅ Cleared melody')
    } else {
      addAIThought('🤔 Processing intent...')
      await generateWithAI()
    }
    
    setIntentInput('')
    setIsGenerating(false)
  }

  const generateFallbackWithGenre = (preset: typeof genrePresets.pop, existingNotes: number): AISuggestion => {
    const beatsPerBar = 4
    const bars = 4
    const baseTime = existingNotes > 0 ? 16 : 0
    
    const melodyNotes = []
    for (let bar = 0; bar < bars; bar++) {
      const notesInBar = Math.floor(Math.random() * 3) + 2
      for (let i = 0; i < notesInBar; i++) {
        const time = bar * beatsPerBar + (i * beatsPerBar / notesInBar)
        const pitch = preset.scale[Math.floor(Math.random() * preset.scale.length)]
        melodyNotes.push({ pitch, time: baseTime + parseFloat(time.toFixed(2)), duration: parseFloat((beatsPerBar / notesInBar * 0.7).toFixed(2)), velocity: Math.floor(Math.random() * 40) + 80 })
      }
    }

    return {
      melody: { notes: melodyNotes },
      drums: { pattern: preset.drumPattern },
      chords: preset.chordProgression.map(c => ({ name: c, duration: 4 }))
    }
  }

  const handlePlay = useCallback(async () => {
    await audioEngine.init()
    await audioEngine.resume()
    audioEngine.setBpm(project.bpm)

    const stepDuration = 60 / project.bpm / 4
    startTimeRef.current = performance.now()
    setIsPlaying(true)
    setCurrentBeat(0)

    const playStep = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000
      const totalSteps = totalBars * 16
      const step = Math.floor((elapsed / stepDuration) % totalSteps)
      setCurrentBeat(step)

      const activeTracks = getActiveTracks()
      
      activeTracks.forEach(track => {
        if (track.type === 'melody' || track.type === 'bass') {
          const notes = getTrackNotes(track.id)
          notes.forEach(note => {
            const noteStep = Math.floor(note.time)
            if (noteStep === step) {
              audioEngine.playNote(note, 0, track.volume)
            }
          })
        } else if (track.type === 'drums') {
          project.tracks.drums.pattern.forEach((trackPattern, idx) => {
            if (trackPattern[step % 16] === 1) {
              const sampleNames = ['kick', 'snare', 'hihat']
              audioEngine.playDrum(sampleNames[idx] || 'kick', 0, track.volume * 0.9)
            }
          })
        }
      })

      if (autoGenerate && step === totalSteps - 1) {
        generateWithAI()
      }

      animationRef.current = requestAnimationFrame(playStep)
    }

    playStep()
  }, [project, totalBars, getActiveTracks, autoGenerate, getTrackNotes])

  const handleStop = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    setIsPlaying(false)
    setCurrentBeat(0)
  }

  const addNote = (pitch: number, time: number, trackId: 'melody' | 'bass' = selectedTrackId === 'bass' ? 'bass' : 'melody') => {
    const newNote: Note = { pitch, time, duration: 1, velocity: noteVelocity }
    setProject(prev => {
      const existingNotes = trackId === 'bass' ? prev.tracks.bass?.notes ?? [] : prev.tracks.melody.notes
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [trackId]: {
            notes: [...existingNotes, newNote]
          } as MelodyTrack
        }
      }
    })
    setSelectionType('note')
  }

  const removeNote = (pitch: number, time: number, trackId: 'melody' | 'bass' = selectedTrackId === 'bass' ? 'bass' : 'melody') => {
    setProject(prev => {
      const existingNotes = trackId === 'bass' ? prev.tracks.bass?.notes ?? [] : prev.tracks.melody.notes
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [trackId]: {
            notes: existingNotes.filter(n => !(n.pitch === pitch && Math.floor(n.time) === Math.floor(time)))
          } as MelodyTrack
        }
      }
    })
    setSelectedNote(null)
  }

  const duplicateSelectedNote = () => {
    if (!selectedNote) return
    const newNote: Note = { ...selectedNote, time: selectedNote.time + 4 }
    const trackId = selectedTrackId === 'bass' ? 'bass' : 'melody'
    setProject(prev => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [trackId]: {
          notes: [...(trackId === 'bass' ? prev.tracks.bass?.notes ?? [] : prev.tracks.melody.notes), newNote]
        } as MelodyTrack
      }
    }))
    setSelectedNote(newNote)
  }

  const handleMouseDown = (pitch: number, beat: number) => {
    setIsDragging(true)
    setDragPitch(pitch)
    const activeTrackId = selectedTrackId === 'bass' ? 'bass' : 'melody'
    const existing = getTrackNotes(activeTrackId).find(n => n.pitch === pitch && Math.floor(n.time) === beat)
    if (existing) {
      setSelectedNote(existing)
      setSelectionType('note')
    } else {
      addNote(pitch, beat, activeTrackId)
    }
  }

  const handleRightClickNote = (e: React.MouseEvent, pitch: number, time: number, trackId: 'melody' | 'bass') => {
    e.preventDefault()
    removeNote(pitch, time, trackId)
  }

  const handleMouseEnter = (pitch: number, beat: number) => {
    if (isDragging && dragPitch !== null) {
      const activeTrackId = selectedTrackId === 'bass' ? 'bass' : 'melody'
      const existing = getTrackNotes(activeTrackId).find(n => n.pitch === pitch && Math.floor(n.time) === beat)
      if (!existing) {
        addNote(pitch, beat, activeTrackId)
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragPitch(null)
  }

  // Clip drag handlers for arrangement view
  const handleClipDragStart = (clipId: string, e: React.MouseEvent) => {
    setDraggingClip(clipId)
    setDragOffsetX(e.clientX)
  }

  const handleClipDragMove = (e: React.MouseEvent) => {
    if (draggingClip) {
      const deltaX = e.clientX - dragOffsetX
      const barDelta = Math.round(deltaX / 80)
      if (barDelta !== 0) {
        setClips(prev => prev.map(clip => 
          clip.id === draggingClip 
            ? { ...clip, startBar: Math.max(0, clip.startBar + barDelta) }
            : clip
        ))
        setDragOffsetX(e.clientX)
      }
    }
  }

  const handleClipDragEnd = () => {
    setDraggingClip(null)
  }

  const toggleDrum = (trackIdx: number, step: number) => {
    setProject(prev => {
      const newPattern = [...prev.tracks.drums.pattern]
      newPattern[trackIdx] = [...newPattern[trackIdx]]
      newPattern[trackIdx][step] = newPattern[trackIdx][step] ? 0 : 1
      return { ...prev, tracks: { ...prev.tracks, drums: { ...prev.tracks.drums, pattern: newPattern } } }
    })
    setSelectionType('drum')
  }

  const handleRightClickDrum = (e: React.MouseEvent, trackIdx: number, step: number) => {
    e.preventDefault()
    toggleDrum(trackIdx, step)
  }

  const updateChord = (barIndex: number, chordName: string) => {
    setProject(prev => {
      const newChords = [...prev.tracks.chords]
      if (chordName) {
        newChords[barIndex] = { name: chordName, duration: newChords[barIndex]?.duration || 4 }
      } else {
        newChords.splice(barIndex, 1)
      }
      return { ...prev, tracks: { ...prev.tracks, chords: newChords } }
    })
    if (chordName) addAIThought(`🎼 Bar ${barIndex + 1}: ${chordName}`)
  }

  const updateTrack = (id: string, updates: Partial<TrackState>) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const newProject = () => {
    setProject(createEmptyProject())
    setTotalBars(4)
    setAiThoughts([])
    setAiSuggestions([])
    setClips([])
  }

  const quantizeNotes = () => {
    const gridSize = 16 / quantize
    setProject(prev => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        melody: {
          notes: prev.tracks.melody.notes.map(n => ({
            ...n,
            time: Math.round(n.time / gridSize) * gridSize
          }))
        }
      }
    }))
    addAIThought('⌚ Notes quantized to 1/' + quantize)
  }

  const transposeNotes = (semitones: number) => {
    setProject(prev => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        melody: {
          notes: prev.tracks.melody.notes.map(n => ({
            ...n,
            pitch: Math.min(127, Math.max(0, n.pitch + semitones))
          }))
        }
      }
    }))
    addAIThought(semitones > 0 ? `⬆️ Transposed +${semitones}` : `⬇️ Transposed ${semitones}`)
  }

  useEffect(() => { audioEngine.setMasterVolume(volume) }, [volume])
  useEffect(() => { audioEngine.setBpm(project.bpm) }, [project.bpm])
  useEffect(() => { audioEngine.setSynthWaveform(synthWave); audioEngine.setDrumKit(drumKit); audioEngine.setReverbMix(reverbAmount) }, [synthWave, drumKit, reverbAmount])
  useEffect(() => {
    if (!isPlaying) {
      setFrequencyBars(Array(32).fill(0))
      return
    }
    const interval = setInterval(() => {
      const data = audioEngine.getFrequencyData()
      setFrequencyBars(Array.from(data.slice(0, 32)))
    }, 50)
    return () => clearInterval(interval)
  }, [isPlaying])

  const selectedTrack = tracks.find(t => t.id === selectedTrackId)

  // Smart Context Panel based on selection
  const renderSmartPanel = () => {
    switch (selectionType) {
      case 'track':
        if (!selectedTrack) return null
        return (
          <div className="smart-panel track-panel">
            <h4>Track: {selectedTrack.name}</h4>
            <div className="panel-controls">
              <label>Volume <input type="range" min={0} max={1} step={0.01} value={selectedTrack.volume || 0.8} onChange={e => selectedTrackId && updateTrack(selectedTrackId, { volume: parseFloat(e.target.value) })} /></label>
              <label>Pan <input type="range" min={-1} max={1} step={0.1} value={selectedTrack.pan || 0} onChange={e => selectedTrackId && updateTrack(selectedTrackId, { pan: parseFloat(e.target.value) })} /></label>
            </div>
            <div className="panel-buttons">
              <button className={selectedTrack.muted ? 'active' : ''} onClick={() => selectedTrackId && updateTrack(selectedTrackId, { muted: !selectedTrack.muted })}>Mute</button>
              <button className={selectedTrack.solo ? 'active' : ''} onClick={() => selectedTrackId && updateTrack(selectedTrackId, { solo: !selectedTrack.solo })}>Solo</button>
            </div>
          </div>
        )
      case 'note':
        return (
          <div className="smart-panel note-panel">
            <h4>Note: {selectedNote ? getNoteName(selectedNote.pitch) : 'Selected'}</h4>
            <div className="panel-controls">
              <label>Velocity <input type="range" min={1} max={127} value={selectedNote?.velocity || 100} onChange={e => {
                if (selectedNote) setProject(prev => ({
                  ...prev,
                  tracks: {
                    ...prev.tracks,
                    melody: {
                      notes: prev.tracks.melody.notes.map(n => n.pitch === selectedNote.pitch && n.time === selectedNote.time ? { ...n, velocity: parseInt(e.target.value) } : n)
                    }
                  }
                }))
              }} /></label>
              <label>Duration <input type="range" min={0.25} max={4} step={0.25} value={selectedNote?.duration || 1} onChange={e => {
                if (selectedNote) setProject(prev => ({
                  ...prev,
                  tracks: {
                    ...prev.tracks,
                    melody: {
                      notes: prev.tracks.melody.notes.map(n => n.pitch === selectedNote.pitch && n.time === selectedNote.time ? { ...n, duration: parseFloat(e.target.value) } : n)
                    }
                  }
                }))
              }} /></label>
            </div>
            <button className="delete-btn" onClick={() => selectedNote && removeNote(selectedNote.pitch, selectedNote.time)}>Delete Note</button>
          </div>
        )
      case 'drum':
        return (
          <div className="smart-panel drum-panel">
            <h4>Drum Track</h4>
            <div className="panel-controls">
              <label>Kit <select value={drumKit} onChange={e => setDrumKit(e.target.value)}>{drumKits.map(k => <option key={k}>{k}</option>)}</select></label>
            </div>
          </div>
        )
      default:
        return (
          <div className="smart-panel project-panel">
            <h4>Project Settings</h4>
            <div className="panel-controls">
              <label>BPM <input type="number" value={project.bpm} onChange={e => setProject(p => ({ ...p, bpm: parseInt(e.target.value) || 120 }))} min={40} max={200} /></label>
              <label>Key <select value={currentKey} onChange={e => setCurrentKey(e.target.value)}>{chordOptions.map(c => <option key={c}>{c}</option>)}</select></label>
              <label>Time Sig <select value={project.timeSignature} onChange={e => setProject(p => ({ ...p, timeSignature: e.target.value }))}>
                <option>4/4</option>
                <option>3/4</option>
                <option>6/8</option>
              </select></label>
            </div>
          </div>
        )
    }
  }

  const renderPatternView = () => (
    <div className="pattern-view">
      <div className="track-sidebar">
        <div className="sidebar-header">
          <span>Tracks</span>
          <button className="add-track-btn">+</button>
        </div>
        <div className="track-list">
          {tracks.map((track, idx) => (
            <div 
              key={track.id} 
              className={`track-item ${selectedTrackId === track.id ? 'selected' : ''}`}
              onClick={() => { setSelectedTrackId(track.id); setSelectionType('track') }}
            >
              <div className="track-icon-wrap" style={{ background: track.color }}>
                {idx + 1}
              </div>
              <div className="track-info">
                <span className="track-name">{track.name}</span>
                <span className="track-type">{track.type}</span>
              </div>
              <div className="track-btns">
                <button className={track.muted ? 'active' : ''} onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}>M</button>
                <button className={track.solo ? 'active' : ''} onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }}>S</button>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-tools">
          <button className="tool-btn" title="Add Instrument">🎹</button>
          <button className="tool-btn" title="Add Drum">🥁</button>
          <button className="tool-btn" title="Add Audio">🎤</button>
        </div>
      </div>
      
      <div className="grid-container">
        <div className="grid-header">
          {Array(totalBars * 16).fill(0).map((_, i) => (
            <div key={i} className={`grid-step-header ${i % 16 === currentBeat ? 'playing' : ''} ${i % 4 === 0 ? 'beat' : ''}`}>
              {i % 16 === 0 && <span className="step-label">{Math.floor(i / 16) + 1}</span>}
            </div>
          ))}
        </div>
        
        <div className="grid-scroll" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          {tracks.map(track => (
            <div key={track.id} className="track-grid" style={{ borderLeft: `3px solid ${track.color}` }}>
              {track.type === 'melody' || track.type === 'bass' ? (
                <div className="piano-grid">
                  {Array(totalRows).fill(0).map((_, row) => {
                    const pitch = 84 - row
                    const isBlack = isBlackKey(pitch)
                    return (
                      <div key={row} className={`piano-row ${isBlack ? 'black-row' : 'white-row'}`}>
                        <span className="note-label">{getNoteName(pitch)}</span>
                        {Array(totalBars * 16).fill(0).map((_, step) => {
                          const trackNotes = track.id === 'bass' ? project.tracks.bass?.notes ?? [] : project.tracks.melody.notes
                          const note = trackNotes.find(n => n.pitch === pitch && Math.floor(n.time) === step)
                          return (
                            <div 
                              key={step} 
                              className={`grid-cell ${step % 16 === currentBeat ? 'playing' : ''}`} 
                              onMouseDown={() => handleMouseDown(pitch, step)} 
                              onMouseEnter={() => handleMouseEnter(pitch, step)} 
                              onMouseUp={handleMouseUp}
                              onContextMenu={(e) => handleRightClickNote(e, pitch, step, track.id === 'bass' ? 'bass' : 'melody')}
                              title={`Click: add note | Right-click: delete\n${getNoteName(pitch)} | Step ${step + 1}`}
                              style={note ? { 
                                backgroundColor: track.color, 
                                opacity: note.velocity / 127,
                                boxShadow: `0 0 ${note.velocity / 127 * 8}px ${track.color}`,
                                cursor: 'pointer',
                                border: '1px solid rgba(255,255,255,0.3)'
                              } : { cursor: 'crosshair' }} 
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ) : track.type === 'drums' ? (
                <div className="drum-grid">
                  {['kick', 'snare', 'hihat'].map((drum, idx) => (
                    <div key={drum} className="drum-row">
                      <span className="drum-label" title={drum}>{drum}</span>
                      {Array(totalBars * 16).fill(0).map((_, step) => (
                        <button 
                          key={step} 
                          className={`drum-cell ${project.tracks.drums.pattern[idx]?.[step % 16] ? 'active' : ''} ${step % 16 === currentBeat ? 'playing' : ''}`} 
                          onClick={() => toggleDrum(idx, step % 16)}
                          onContextMenu={(e) => handleRightClickDrum(e, idx, step % 16)}
                          title={`${drum} step ${(step % 16) + 1}\nClick: toggle | Right-click: delete`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="chord-track">
                  {Array(totalBars).fill(0).map((_, bar) => {
                    const barChord = project.tracks.chords[bar]
                    return (
                      <div key={bar} className="chord-block" title={`Bar ${bar + 1}: Edit chord`}>
                        <select 
                          className="chord-select"
                          value={barChord?.name || ''}
                          onChange={(e) => updateChord(bar, e.target.value)}
                        >
                          <option value="">-Select chord-</option>
                          {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(note => (
                            <optgroup key={note} label={note}>
                              <option value={note}>{note}</option>
                              <option value={note + 'm'}>{note}m</option>
                              <option value={note + '7'}>{note}7</option>
                              <option value={note + 'maj7'}>{note}maj7</option>
                              <option value={note + 'm7'}>{note}m7</option>
                              <option value={note + 'maj9'}>{note}maj9</option>
                              <option value={note + 'm9'}>{note}m9</option>
                              <option value={note + 'aug'}>{note}aug</option>
                              <option value={note + 'dim'}>{note}dim</option>
                            </optgroup>
                          ))}
                        </select>
                        {barChord && (
                          <button 
                            className="chord-delete"
                            onClick={(e) => { e.stopPropagation(); updateChord(bar, '') }}
                            title="Delete chord"
                          >✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderArrangementView = () => (
    <div className="arrangement-view">
      <div className="arrangement-tracks">
        {tracks.map(track => (
          <div key={track.id} className="arrangement-track-lane" style={{ borderLeft: `3px solid ${track.color}` }}>
            <div className="lane-header">{track.name}</div>
            <div className="lane-content">
              <div className="timeline-ruler">
                {Array(totalBars).fill(0).map((_, bar) => (
                  <div key={bar} className="bar-marker">{bar + 1}</div>
                ))}
              </div>
              <div className="lane-grid" onMouseMove={handleClipDragMove} onMouseUp={handleClipDragEnd} onMouseLeave={handleClipDragEnd}>
                {clips.filter(c => c.trackId === track.id).map(clip => (
                  <div key={clip.id} className="clip-block" style={{ 
                    left: clip.startBar * 80, 
                    width: clip.duration * 80,
                    backgroundColor: clip.color
                  }} onMouseDown={(e) => handleClipDragStart(clip.id, e)}>
                    {clip.data?.name || track.name}
                  </div>
                ))}
                {track.type === 'melody' && project.tracks.melody.notes.map((note, i) => {
                  const bar = Math.floor(note.time / 16)
                  const pos = (note.time % 16) / 16 * 80
                  return (
                    <div key={i} className="note-block" style={{ 
                      left: bar * 80 + pos, 
                      backgroundColor: track.color 
                    }} />
                  )
                })}
                {track.type === 'bass' && (project.tracks.bass?.notes ?? []).map((note, i) => {
                  const bar = Math.floor(note.time / 16)
                  const pos = (note.time % 16) / 16 * 80
                  return (
                    <div key={i} className="note-block bass-note" style={{ 
                      left: bar * 80 + pos, 
                      backgroundColor: track.color 
                    }} />
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderFlowView = () => (
    <div className="flow-view">
      <div className="routing-graph">
        <div className="flow-nodes">
          {tracks.map(track => (
            <div key={track.id} className="flow-node" style={{ borderColor: track.color }}>
              <div className="node-header" style={{ background: track.color }}>{track.name}</div>
              <div className="node-controls">
                <label>Vol <input type="range" min={0} max={1} step={0.01} value={audioRouting[track.id as keyof typeof audioRouting]?.volume || 0.8} onChange={e => setAudioRouting(prev => ({ ...prev, [track.id]: { ...prev[track.id as keyof typeof audioRouting], volume: parseFloat(e.target.value) } }))} /></label>
                <label>Pan <input type="range" min={-1} max={1} step={0.1} value={audioRouting[track.id as keyof typeof audioRouting]?.pan || 0} onChange={e => setAudioRouting(prev => ({ ...prev, [track.id]: { ...prev[track.id as keyof typeof audioRouting], pan: parseFloat(e.target.value) } }))} /></label>
                <button className={audioRouting[track.id as keyof typeof audioRouting]?.muted ? 'active' : ''} onClick={() => setAudioRouting(prev => ({ ...prev, [track.id]: { ...prev[track.id as keyof typeof audioRouting], muted: !prev[track.id as keyof typeof audioRouting].muted } }))}>M</button>
              </div>
              <div className="node-effects">
                {audioRouting[track.id as keyof typeof audioRouting]?.effects?.map((fx, i) => (
                  <span key={i} className="effect-badge">{fx}</span>
                ))}
                <select className="effect-select" onChange={e => {
                  if (e.target.value) setAudioRouting(prev => ({ ...prev, [track.id]: { ...prev[track.id as keyof typeof audioRouting], effects: [...(prev[track.id as keyof typeof audioRouting]?.effects || []), e.target.value] } }))
                }}>
                  <option value="">+FX</option>
                  <option value="reverb">Reverb</option>
                  <option value="delay">Delay</option>
                  <option value="distortion">Distortion</option>
                  <option value="filter">Filter</option>
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="flow-output">
          <div className="output-node">🎛️ Master Output</div>
          <div className="flow-line" />
          <div className="frequency-visualizer">
            {frequencyBars.map((v, i) => (
              <div key={i} className="freq-bar" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderMixView = () => (
    <div className="mix-view">
      <div className="mixer-strip">
        {tracks.map(track => (
          <div key={track.id} className="channel-strip">
            <div className="channel-name" style={{ color: track.color }}>{track.name}</div>
            <div className="channel-meter">
              <div className="meter-bar" style={{ height: '60%' }} />
              <div className="meter-bar" style={{ height: '55%' }} />
            </div>
            <div className="channel-controls">
              <button className={track.muted ? 'active' : ''} onClick={() => updateTrack(track.id, { muted: !track.muted })}>M</button>
              <button className={track.solo ? 'active' : ''} onClick={() => updateTrack(track.id, { solo: !track.solo })}>S</button>
            </div>
            <div className="channel-fader">
              <input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={e => updateTrack(track.id, { volume: parseFloat(e.target.value) })} />
              <span>{Math.round(track.volume * 100)}%</span>
            </div>
            <div className="channel-pan">
              <input type="range" min={-1} max={1} step={0.1} value={track.pan} onChange={e => updateTrack(track.id, { pan: parseFloat(e.target.value) })} />
              <span>Pan</span>
            </div>
          </div>
        ))}
        <div className="channel-strip master">
          <div className="channel-name">Master</div>
          <div className="channel-meter">
            <div className="meter-bar" />
            <div className="meter-bar" />
          </div>
          <div className="channel-fader">
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(parseFloat(e.target.value))} />
            <span>{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  )

  // Quick Actions Bar
  const renderQuickActions = () => (
    <div className="quick-actions">
      <button onClick={() => selectedNote && removeNote(selectedNote.pitch, selectedNote.time)} disabled={!selectedNote}>Delete</button>
      <button onClick={duplicateSelectedNote} disabled={!selectedNote}>Duplicate</button>
      <button onClick={quantizeNotes}>Quantize 1/{quantize}</button>
      <button onClick={() => transposeNotes(1)}>↑ +1</button>
      <button onClick={() => transposeNotes(-1)}>↓ -1</button>
      <span className="action-hint">Press Tab to switch views • Space to play • Q to quantize</span>
    </div>
  )

  const commands = [
    { id: 'play', label: 'Play / Pause', action: () => isPlaying ? handleStop() : handlePlay() },
    { id: 'stop', label: 'Stop', action: handleStop },
    { id: 'clear', label: 'Clear Pattern', action: () => setProject(p => ({ ...p, tracks: { ...p.tracks, melody: { notes: [] }, drums: { ...p.tracks.drums, pattern: Array(3).fill(null).map(() => Array(16).fill(0)) }, chords: [] } })) },
    { id: 'generate', label: 'Generate with AI', action: () => { setShowAI(true); generateWithAI() } },
    { id: 'pattern', label: 'Switch to Pattern View', action: () => setView('pattern') },
    { id: 'arrange', label: 'Switch to Arrangement View', action: () => setView('arrange') },
    { id: 'mix', label: 'Switch to Mix View', action: () => setView('mix') },
    { id: 'bpm+', label: 'BPM +10', action: () => setProject(p => ({ ...p, bpm: Math.min(200, p.bpm + 10) })) },
    { id: 'bpm-', label: 'BPM -10', action: () => setProject(p => ({ ...p, bpm: Math.max(60, p.bpm - 10) })) },
  ]

  const filteredCommands = commands.filter(c => c.label.toLowerCase().includes(commandQuery.toLowerCase()))

  return (
    <div className="app">
      {showCommandPalette && (
        <div className="command-palette-overlay" onClick={() => setShowCommandPalette(false)}>
          <div className="command-palette" onClick={e => e.stopPropagation()}>
            <input 
              type="text" 
              className="command-input"
              placeholder="Type a command..."
              value={commandQuery}
              onChange={e => setCommandQuery(e.target.value)}
              autoFocus
            />
            <div className="command-list">
              {filteredCommands.map(cmd => (
                <div key={cmd.id} className="command-item" onClick={() => { cmd.action(); setShowCommandPalette(false) }}>
                  {cmd.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {showHotkeys && (
        <div className="hotkeys-overlay" onClick={() => setShowHotkeys(false)}>
          <div className="hotkeys-panel" onClick={e => e.stopPropagation()}>
            <div className="hotkeys-header">
              <h2>⌨️ Keyboard Shortcuts</h2>
              <button className="hotkeys-close" onClick={() => setShowHotkeys(false)}>✕</button>
            </div>
            <div className="hotkeys-content">
              <div className="hotkeys-section">
                <h3>🎵 Playback</h3>
                <div className="hotkey-row"><kbd>SPACE</kbd> <span>Play / Stop</span></div>
                <div className="hotkey-row"><kbd>Ctrl+L</kbd> <span>Toggle Loop</span></div>
                <div className="hotkey-row"><kbd>Ctrl+Shift+M</kbd> <span>Toggle Metronome</span></div>
              </div>
              
              <div className="hotkeys-section">
                <h3>🎹 Editing</h3>
                <div className="hotkey-row"><kbd>1-4</kbd> <span>Select Track (Melody/Bass/Drums/Chords)</span></div>
                <div className="hotkey-row"><kbd>M</kbd> <span>Mute Selected Track</span></div>
                <div className="hotkey-row"><kbd>S</kbd> <span>Solo Selected Track</span></div>
                <div className="hotkey-row"><kbd>Delete</kbd> <span>Delete Selected Note</span></div>
                <div className="hotkey-row"><kbd>Q</kbd> <span>Cycle Quantize (16/8/4/2)</span></div>
              </div>
              
              <div className="hotkeys-section">
                <h3>🎚️ Parameters</h3>
                <div className="hotkey-row"><kbd>+/=</kbd> <span>Increase BPM (+5)</span></div>
                <div className="hotkey-row"><kbd>-</kbd> <span>Decrease BPM (-5)</span></div>
                <div className="hotkey-row"><kbd>[</kbd> <span>Decrease Velocity (-10)</span></div>
                <div className="hotkey-row"><kbd>]</kbd> <span>Increase Velocity (+10)</span></div>
              </div>
              
              <div className="hotkeys-section">
                <h3>🤖 AI & Project</h3>
                <div className="hotkey-row"><kbd>Ctrl+G</kbd> <span>Generate with AI</span></div>
                <div className="hotkey-row"><kbd>Ctrl+S</kbd> <span>Save Project</span></div>
                <div className="hotkey-row"><kbd>Ctrl+K</kbd> <span>Command Palette</span></div>
              </div>
              
              <div className="hotkeys-section">
                <h3>👁️ Views</h3>
                <div className="hotkey-row"><kbd>TAB</kbd> <span>Switch View (Pattern/Arrange/Mix)</span></div>
                <div className="hotkey-row"><kbd>H</kbd> <span>Show Help</span></div>
                <div className="hotkey-row"><kbd>ESC</kbd> <span>Clear Selection / Close Panels</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {errorModal && (
        <div className="error-overlay" onClick={() => setErrorModal(null)}>
          <div className="error-modal" onClick={e => e.stopPropagation()}>
            <div className="error-icon">⚠️</div>
            <h2>{errorModal.title}</h2>
            <p className="error-message">{errorModal.message}</p>
            <button className="error-btn" onClick={() => setErrorModal(null)}>OK</button>
          </div>
        </div>
      )}
      
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">♪</span>
            <h1>BeatMaker Pro</h1>
          </div>
          <span className="project-name">{project.name}</span>
        </div>
        
        <div className="header-center">
          <div className="transport">
            <button className="transport-btn stop" onClick={handleStop}>
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
            </button>
            <button className={`transport-btn play ${isPlaying ? 'playing' : ''}`} onClick={isPlaying ? handleStop : handlePlay}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              )}
            </button>
          </div>
          
          <div className="time-display">
            <span className="time-bar">{String(Math.floor(currentBeat / 4) + 1).padStart(2, '0')}</span>
            <span className="time-sep">:</span>
            <span className="time-beat">{String((currentBeat % 4) + 1).padStart(2, '0')}</span>
            <span className="time-sep">:</span>
            <span className="time-step">{currentBeat % 16}</span>
          </div>
          
          <div className="loop-section">
            <button 
              className={`loop-btn ${isLooping ? 'active' : ''}`}
              onClick={() => setIsLooping(!isLooping)}
              title="Toggle loop (Ctrl+L)"
            >🔁</button>
            <button 
              className={`metronome-btn ${isMetronomeOn ? 'active' : ''}`}
              onClick={() => setIsMetronomeOn(!isMetronomeOn)}
              title="Toggle metronome (Ctrl+Shift+M)"
            >♩</button>
          </div>
        </div>
        
        <div className="header-right">
          <div className="view-tabs">
            <button className={view === 'pattern' ? 'active' : ''} onClick={() => setView('pattern')}>Pattern</button>
            <button className={view === 'arrange' ? 'active' : ''} onClick={() => setView('arrange')}>Arrange</button>
            <button className={view === 'mix' ? 'active' : ''} onClick={() => setView('mix')}>Mix</button>
            <button className={view === 'flow' ? 'active' : ''} onClick={() => setView('flow')}>Flow</button>
          </div>
          
          <div className="header-actions">
            <button className="icon-btn" onClick={() => setShowSounds(!showSounds)}>🎵</button>
            <button className="icon-btn" onClick={() => setShowAI(!showAI)}>🤖</button>
            <button onClick={newProject}>New</button>
            <input type="file" accept=".beatmaker,.json" style={{ display: 'none' }} id="import-input" onChange={importProject} />
            <label htmlFor="import-input" className="import-btn">Load</label>
            <button onClick={exportProject}>Save</button>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-group">
          <div className="param-control">
            <label>BPM</label>
            <input type="number" value={project.bpm} onChange={e => setProject(p => ({ ...p, bpm: parseInt(e.target.value) || 120 }))} min={40} max={200} />
          </div>
          <div className="param-control">
            <label>Key</label>
            <select value={currentKey} onChange={e => setCurrentKey(e.target.value)}>
              {chordOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="param-control">
            <label>Genre</label>
            <select value={genre} onChange={e => setGenre(e.target.value)}>
              {genres.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
            </select>
          </div>
          <div className="param-control">
            <label>Mode</label>
            <select value={currentMode} onChange={e => setCurrentMode(e.target.value as typeof modes[number])}>
              {modes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="param-control">
            <label>Zoom</label>
            <input type="range" min={0.5} max={2} step={0.1} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
          </div>
        </div>
        
        <div className="timeline-bar">
          {Array(totalBars).fill(0).map((_, bar) => (
            <div key={bar} className={`timeline-bar-segment ${Math.floor(currentBeat / 16) === bar ? 'active' : ''}`}>
              <span className="bar-number">{bar + 1}</span>
              <div className="beat-dots">
                {Array(4).fill(0).map((_, beat) => (
                  <div key={beat} className={`beat-dot ${Math.floor(currentBeat / 4) === bar * 4 + beat ? 'active' : ''}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="toolbar-group right">
          <div className="param-control small">
            <label>Bars</label>
            <input type="number" value={totalBars} onChange={e => setTotalBars(parseInt(e.target.value) || 4)} min={1} max={64} />
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={autoGenerate} onChange={e => setAutoGenerate(e.target.checked)} />
            <span>Auto-AI</span>
          </label>
        </div>
      </div>

      <div className="workspace">
        <div className="main-area">
          {view === 'pattern' && renderPatternView()}
          {view === 'arrange' && renderArrangementView()}
          {view === 'mix' && renderMixView()}
          {view === 'flow' && renderFlowView()}
        </div>
        
        <div className="smart-panel-container">
          {renderSmartPanel()}
        </div>
        
        {showAI && (
          <div className="ai-panel">
            <div className="panel-header">
              <h3>🤖 AI Assistant</h3>
              <button className="close-btn" onClick={() => setShowAI(false)}>×</button>
            </div>
            <div className="ai-content">
              <div className="ai-status-bar">
                <div className={`status-indicator ${isGenerating ? 'generating' : 'idle'}`}>
                  {isGenerating ? '🤖 Thinking...' : '✨ Ready'}
                </div>
              </div>
              <div className="ai-thoughts">
                {aiThoughts.length === 0 && <div className="thought-empty">AI ready to generate music!</div>}
                {aiThoughts.slice().reverse().map(t => (
                  <div key={t.id} className="thought-bubble">{t.text}</div>
                ))}
              </div>
              <div className="ai-input">
                <input type="password" placeholder="OpenRouter API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} onBlur={saveApiKey} disabled={isLoadingKey} />
                <input 
                  type="text" 
                  className="intent-input"
                  placeholder="e.g., add bass line, make it darker, faster tempo..."
                  value={intentInput}
                  onChange={e => setIntentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && intentInput) generateWithIntent(intentInput) }}
                />
                <button className="ai-generate-btn" onClick={() => generateWithIntent(intentInput)} disabled={isGenerating}>
                  {isGenerating ? '⏳' : '🚀'}
                </button>
              </div>
              {aiSuggestions.length > 0 && (
                <div className="ai-suggestions">
                  <h4>Last Generation:</h4>
                  {aiSuggestions.map((s, i) => (
                    <span key={i} className="suggestion-chip">{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {showSounds && (
          <div className="sounds-panel">
            <div className="panel-header">
              <h3>Sounds</h3>
              <button className="close-btn" onClick={() => setShowSounds(false)}>×</button>
            </div>
            <div className="panel-content">
              <div className="sound-section">
                <h4>Synth</h4>
                <div className="sound-grid">
                  {waveforms.map(w => (
                    <button key={w} className={`sound-pad ${synthWave === w ? 'active' : ''}`} onClick={() => setSynthWave(w)}>
                      <span className="pad-name">{w}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="sound-section">
                <h4>Drum Kit</h4>
                <div className="sound-grid">
                  {drumKits.map(k => (
                    <button key={k} className={`sound-pad ${drumKit === k ? 'active' : ''}`} onClick={() => setDrumKit(k)}>
                      <span className="pad-name">{k}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="sound-section">
                <h4>Effects</h4>
                <div className="effect-knob">
                  <label>Reverb</label>
                  <input type="range" min={0} max={0.5} step={0.01} value={reverbAmount} onChange={e => setReverbAmount(parseFloat(e.target.value))} />
                  <span>{Math.round(reverbAmount * 100)}%</span>
                </div>
                <div className="effect-knob">
                  <label>Velocity</label>
                  <input type="range" min={40} max={127} value={noteVelocity} onChange={e => setNoteVelocity(parseInt(e.target.value))} />
                  <span>{noteVelocity}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {renderQuickActions()}
      
      <footer className="footer">
        <div className="footer-left">
          <div className="waveform-display">
            <div className="waveform-bars">
              {Array(32).fill(0).map((_, i) => (
                <div key={i} className="wave-bar" style={{ height: `${Math.random() * 60 + 20}%`, animationDelay: `${i * 0.05}s` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="footer-center">
          <div className="keyboard-hint">
            Space: Play/Stop | Tab: Switch View | 1-4: Select Track | M: Mute | S: Solo | Q: Quantize
          </div>
        </div>
        <div className="footer-right">
          <div className="track-stats">
            <span>🎵 {project.tracks.melody.notes.length} notes</span>
            <span>🥁 {project.tracks.drums.pattern[0].filter(x => x).length} beats</span>
            <span>📐 {totalBars} bars</span>
            <span>🎯 {selectionType}</span>
          </div>
          <div className="master-volume">
            <label>Vol</label>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(parseFloat(e.target.value))} />
            <span>{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </footer>
    </div>
  )
}