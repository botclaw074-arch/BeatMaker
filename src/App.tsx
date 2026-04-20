import { useState, useEffect, useCallback, useRef } from 'react'
import { audioEngine } from './audio/engine'
import { getAISuggestion, generateFallbackSuggestion, getScaleNotes, type AISuggestion } from './ai/suggestion'
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
  data: unknown
}

interface AIThought {
  id: number
  text: string
}

const trackColors = ['#00a8e8', '#ff6b6b', '#feca57', '#48dbfb']

const genrePresets: Record<string, { scale: number[]; chordProgression: string[]; drumPattern: number[][]; bpm: number }> = {
  pop:  { scale: [60,62,64,65,67,69,71,72], chordProgression: ['C','G','Am','F'],       drumPattern: [[1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]], bpm: 120 },
  edm:  { scale: [60,62,64,67,70,72],       chordProgression: ['C','F','G','C'],         drumPattern: [[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]], bpm: 128 },
  lofi: { scale: [60,62,63,65,67,70,72],    chordProgression: ['Cmaj7','Am7','Dm7','G7'], drumPattern: [[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1]], bpm: 85 },
  trap: { scale: [58,60,62,63,66,70,72],    chordProgression: ['Cm','Ab','Bb','Gm'],     drumPattern: [[1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1]], bpm: 140 },
  rock: { scale: [60,62,64,65,67,69,71,72], chordProgression: ['G','C','D','G'],         drumPattern: [[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]], bpm: 120 },
  jazz: { scale: [60,62,63,65,67,69,70,72], chordProgression: ['Cmaj7','Dm7','G7','Cmaj7'], drumPattern: [[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]], bpm: 110 },
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

  const [view, setView] = useState<ViewMode>('pattern')
  const [zoom, setZoom] = useState(1)

  const [selectionType, setSelectionType] = useState<SelectionType>('none')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>('melody')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)

  const [showSounds, setShowSounds] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [showHotkeys, setShowHotkeys] = useState(false)
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null)
  const [isLooping, setIsLooping] = useState(true)
  const [isMetronomeOn, setIsMetronomeOn] = useState(false)

  const [aiThoughts, setAiThoughts] = useState<AIThought[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [genre, setGenre] = useState('pop')
  const [autoGenerate, setAutoGenerate] = useState(false)

  const [clips, setClips] = useState<Clip[]>([])
  const [quantize, setQuantize] = useState(16)

  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [intentInput, setIntentInput] = useState('')

  const [audioRouting, setAudioRouting] = useState({
    melody: { volume: 0.8, pan: 0, muted: false, effects: ['reverb'] },
    bass:   { volume: 0.8, pan: 0, muted: false, effects: [] as string[] },
    drums:  { volume: 0.9, pan: 0, muted: false, effects: [] as string[] },
    chords: { volume: 0.6, pan: 0, muted: false, effects: ['reverb'] },
  })

  const [frequencyBars, setFrequencyBars] = useState<number[]>(Array(32).fill(0))

  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)

  const chordOptions = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const modes = ['major', 'minor', 'dorian', 'mixolydian', 'pentatonic'] as const
  const waveforms: OscillatorType[] = ['sawtooth', 'triangle', 'square', 'sine']
  const drumKits = ['default', 'electro', 'acoustic', '808']
  const genres = Object.keys(genrePresets)

  const [currentKey, setCurrentKey] = useState('C')
  const [currentMode, setCurrentMode] = useState<string>('major')
  const [synthWave, setSynthWave] = useState<OscillatorType>('sawtooth')
  const [drumKit, setDrumKit] = useState('default')
  const [reverbAmount, setReverbAmount] = useState(0.18)
  const [noteVelocity, setNoteVelocity] = useState(100)

  const [isDragging, setIsDragging] = useState(false)
  const [dragPitch, setDragPitch] = useState<number | null>(null)
  const [draggingClip, setDraggingClip] = useState<string | null>(null)
  const [dragOffsetX, setDragOffsetX] = useState(0)

  const startOctave = 3
  const endOctave = 6
  const totalRows = (endOctave - startOctave + 1) * 12

  const getTrackNotes = useCallback((trackId: string) => {
    if (trackId === 'bass') return project.tracks.bass?.notes ?? []
    return project.tracks.melody.notes
  }, [project.tracks])

  const [tracks, setTracks] = useState<TrackState[]>([
    { id: 'melody', name: 'Synth',  type: 'melody', muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[0] },
    { id: 'bass',   name: 'Bass',   type: 'bass',   muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[3] },
    { id: 'drums',  name: 'Drums',  type: 'drums',  muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[1] },
    { id: 'chords', name: 'Pad',    type: 'chords', muted: false, solo: false, volume: 0.8, pan: 0, color: trackColors[2] },
  ])

  useEffect(() => {
    const loadApiKey = async () => {
      if (window.electronAPI) {
        const savedKey = await window.electronAPI.storeGet('openrouter_api_key')
        if (savedKey) setApiKey(savedKey as string)
      }
      setIsLoadingKey(false)
    }
    loadApiKey()
  }, [])

  const addAIThought = (text: string) => {
    setAiThoughts(prev => [...prev.slice(-4), { id: Date.now(), text }])
  }

  const saveApiKey = async () => {
    if (window.electronAPI) await window.electronAPI.storeSet('openrouter_api_key', apiKey)
  }

  const exportProject = () => {
    const data = { version: '1.0', name: project.name, bpm: project.bpm, timeSignature: project.timeSignature, tracks: project.tracks, audioRouting, createdAt: Date.now() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${project.name.replace(/\s+/g, '_')}.beatmaker`; a.click()
    URL.revokeObjectURL(url)
  }

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        setProject({ name: data.name || 'Loaded Project', bpm: data.bpm || 120, timeSignature: data.timeSignature || '4/4', version: '1.0', tracks: data.tracks || createEmptyProject().tracks })
        if (data.audioRouting) setAudioRouting(data.audioRouting)
      } catch (err) { console.error('Failed to load project:', err) }
    }
    reader.readAsText(file)
  }

  const getActiveTracks = useCallback(() => {
    const soloed = tracks.filter(t => t.solo)
    return soloed.length > 0 ? soloed : tracks.filter(t => !t.muted)
  }, [tracks])

  const analyzeProject = useCallback(() => {
    const melodyCount = project.tracks.melody.notes.length
    let drumActivity = 0
    project.tracks.drums.pattern.forEach(row => row.forEach(v => { if (v) drumActivity++ }))
    if (melodyCount === 0 && drumActivity === 0) return 'Empty project — building from scratch'
    if (melodyCount > 8 && project.tracks.chords.length > 2) return 'Rich composition with melody & chords'
    if (drumActivity > 20) return 'Heavy beat-driven track'
    return `Growing: ${melodyCount} melody notes, ${drumActivity} drum hits`
  }, [project])

  // ─── AI Generation ────────────────────────────────────────────────────
  const applyAISuggestion = (suggestion: AISuggestion, startBeat: number) => {
    const totalSteps = totalBars * 16

    // Validate notes are within current pattern bounds (or extend if needed)
    const maxTime = startBeat + 16  // 4 bars
    const filteredNotes = suggestion.melody.notes.filter(n => n.time >= 0 && n.time < maxTime)

    setProject(prev => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        melody: { notes: [...prev.tracks.melody.notes, ...filteredNotes] },
        drums: {
          ...prev.tracks.drums,
          pattern: suggestion.drums.pattern.map(row => {
            // Tile drum pattern to fill totalBars*16 steps
            const tiled: number[] = []
            for (let i = 0; i < totalSteps; i++) tiled.push(row[i % 16] ?? 0)
            return tiled
          }),
        },
        chords: suggestion.chords.length > 0
          ? [...prev.tracks.chords, ...suggestion.chords].slice(0, totalBars * 2)
          : prev.tracks.chords,
      },
    }))

    setAiSuggestions([
      `Added ${filteredNotes.length} melodic notes`,
      `Key: ${currentKey} ${currentMode} | Genre: ${genre}`,
      `Chords: ${suggestion.chords.map(c => c.name).join(' → ') || 'unchanged'}`,
    ])
  }

  const generateWithAI = async () => {
    setIsGenerating(true)
    addAIThought('🎵 Analyzing project...')

    const analysis = analyzeProject()
    addAIThought('📊 ' + analysis)

    // Calculate where new content should start
    const lastNoteTime = project.tracks.melody.notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0)
    const startBeat = Math.ceil(lastNoteTime / 4) * 4

    try {
      if (!apiKey) {
        setErrorModal({
          title: 'API Key Required',
          message: 'No OpenRouter API key found.\n\nTo use AI generation, enter your API key in the settings panel (🤖 button).\n\nGet a free key at: https://openrouter.ai'
        })
        setIsGenerating(false)
        return
      }
      
      addAIThought(`🤖 Calling AI (${currentKey} ${currentMode}, ${genre})...`)
      const suggestion = await getAISuggestion(
        apiKey,
        project.tracks.melody.notes,
        project.tracks.drums.pattern,
        project.tracks.chords,
        project.bpm,
        currentKey,
        currentMode
      )
      addAIThought(`✨ Got ${suggestion.melody.notes.length} notes from AI`)
      applyAISuggestion(suggestion, startBeat)
      setTotalBars(prev => Math.max(prev, Math.ceil((startBeat + 16) / 4)))
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      let title = 'Generation Failed'
      let fix = ''
      if (errMsg.includes('404')) { title = 'API Error (404)'; fix = 'Check your OpenRouter API key.' }
      else if (errMsg.includes('401') || errMsg.includes('403')) { title = 'Invalid API Key'; fix = 'Key should start with "sk-or-v1-".' }
      else if (errMsg.includes('429')) { title = 'Rate Limited'; fix = 'Wait a moment and try again.' }
      else if (errMsg.includes('fetch') || errMsg.includes('network')) { title = 'Network Error'; fix = 'Check your internet connection.' }

      console.error('AI error:', errMsg)

      // Auto-fallback on error
      addAIThought('⚠️ AI error — using musical fallback')
      const suggestion = generateFallbackSuggestion(project.bpm)
      applyAISuggestion(suggestion, startBeat)
      setTotalBars(prev => Math.max(prev, Math.ceil((startBeat + 16) / 4)))

      if (title !== 'Generation Failed') {
        setErrorModal({ title, message: errMsg + (fix ? '\n\nHint: ' + fix : '') })
      }
    }

    addAIThought('✅ Done! Press Space to play.')
    setIsGenerating(false)
  }

  const generateWithIntent = async (intent: string) => {
    if (!intent.trim()) return
    setIsGenerating(true)
    addAIThought(`🎯 "${intent}"`)
    const lo = intent.toLowerCase()

    if (lo.includes('bass')) {
      const scale = getScaleNotes(currentKey, currentMode, 2, 3)
      const bassNotes = scale.slice(0, 4).map((pitch, i) => ({ pitch, time: i * 4, duration: 3.5, velocity: 110 }))
      setProject(prev => ({ ...prev, tracks: { ...prev.tracks, bass: { notes: [...(prev.tracks.bass?.notes ?? []), ...bassNotes] } } }))
      addAIThought('✅ Added bass line')
    } else if (lo.includes('faster') || lo.includes('speed up')) {
      const newBpm = Math.min(200, project.bpm + 20)
      setProject(prev => ({ ...prev, bpm: newBpm }))
      addAIThought(`⏩ BPM: ${project.bpm} → ${newBpm}`)
    } else if (lo.includes('slower')) {
      const newBpm = Math.max(60, project.bpm - 20)
      setProject(prev => ({ ...prev, bpm: newBpm }))
      addAIThought(`⏪ BPM: ${project.bpm} → ${newBpm}`)
    } else if (lo.includes('darker') || lo.includes('lower')) {
      setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, pitch: Math.max(21, n.pitch - 2) })) } } }))
      addAIThought('✅ Shifted pitch down 2 semitones')
    } else if (lo.includes('brighter') || lo.includes('higher')) {
      setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, pitch: Math.min(108, n.pitch + 2) })) } } }))
      addAIThought('✅ Shifted pitch up 2 semitones')
    } else if (lo.includes('clear') || lo.includes('reset')) {
      setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: [] } } }))
      addAIThought('✅ Cleared melody')
    } else if (lo.includes('more notes') || lo.includes('busier')) {
      await generateWithAI()
      return
    } else {
      addAIThought('🤖 Generating with AI...')
      setIntentInput('')
      setIsGenerating(false)
      await generateWithAI()
      return
    }

    setIntentInput('')
    setIsGenerating(false)
  }

  // ─── Playback ──────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    await audioEngine.init()
    await audioEngine.resume()
    audioEngine.setBpm(project.bpm)

    const stepDuration = 60 / project.bpm / 4
    startTimeRef.current = performance.now()
    setIsPlaying(true)
    setCurrentBeat(0)

    const totalSteps = totalBars * 16

    const playStep = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000
      const step = Math.floor((elapsed / stepDuration) % totalSteps)
      setCurrentBeat(step)

      const activeTracks = getActiveTracks()
      activeTracks.forEach(track => {
        if (track.type === 'melody' || track.type === 'bass') {
          const notes = getTrackNotes(track.id)
          notes.forEach(note => {
            if (Math.floor(note.time) === step) audioEngine.playNote(note, 0, track.volume)
          })
        } else if (track.type === 'drums') {
          project.tracks.drums.pattern.forEach((pat, idx) => {
            if (pat[step % 16] === 1) {
              const names = ['kick', 'snare', 'hihat']
              audioEngine.playDrum(names[idx] || 'kick', 0, track.volume * 0.9)
            }
          })
        }
      })

      if (autoGenerate && step === totalSteps - 1 && !isGenerating) generateWithAI()
      animationRef.current = requestAnimationFrame(playStep)
    }
    playStep()
  }, [project, totalBars, getActiveTracks, autoGenerate, getTrackNotes])

  const handleStop = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    setIsPlaying(false)
    setCurrentBeat(0)
  }, [])

  // ─── Note editing ──────────────────────────────────────────────────────
  const addNote = (pitch: number, time: number, trackId: 'melody' | 'bass' = selectedTrackId === 'bass' ? 'bass' : 'melody') => {
    const newNote: Note = { pitch, time, duration: 1, velocity: noteVelocity }
    setProject(prev => {
      const existing = trackId === 'bass' ? prev.tracks.bass?.notes ?? [] : prev.tracks.melody.notes
      return { ...prev, tracks: { ...prev.tracks, [trackId]: { notes: [...existing, newNote] } as MelodyTrack } }
    })
    setSelectionType('note')
  }

  const removeNote = (pitch: number, time: number, trackId: 'melody' | 'bass' = selectedTrackId === 'bass' ? 'bass' : 'melody') => {
    setProject(prev => {
      const existing = trackId === 'bass' ? prev.tracks.bass?.notes ?? [] : prev.tracks.melody.notes
      return { ...prev, tracks: { ...prev.tracks, [trackId]: { notes: existing.filter(n => !(n.pitch === pitch && Math.floor(n.time) === Math.floor(time))) } as MelodyTrack } }
    })
    setSelectedNote(null)
  }

  const duplicateSelectedNote = () => {
    if (!selectedNote) return
    const newNote: Note = { ...selectedNote, time: selectedNote.time + 4 }
    const trackId = selectedTrackId === 'bass' ? 'bass' : 'melody'
    setProject(prev => {
      const existing = trackId === 'bass' ? prev.tracks.bass?.notes ?? [] : prev.tracks.melody.notes
      return { ...prev, tracks: { ...prev.tracks, [trackId]: { notes: [...existing, newNote] } as MelodyTrack } }
    })
    setSelectedNote(newNote)
  }

  const handleMouseDown = (pitch: number, beat: number) => {
    setIsDragging(true); setDragPitch(pitch)
    const activeTrackId = selectedTrackId === 'bass' ? 'bass' : 'melody'
    const existing = getTrackNotes(activeTrackId).find(n => n.pitch === pitch && Math.floor(n.time) === beat)
    if (existing) { setSelectedNote(existing); setSelectionType('note') }
    else addNote(pitch, beat, activeTrackId)
  }

  const handleMouseEnter = (pitch: number, beat: number) => {
    if (isDragging && dragPitch !== null) {
      const activeTrackId = selectedTrackId === 'bass' ? 'bass' : 'melody'
      const existing = getTrackNotes(activeTrackId).find(n => n.pitch === pitch && Math.floor(n.time) === beat)
      if (!existing) addNote(pitch, beat, activeTrackId)
    }
  }

  const handleMouseUp = () => { setIsDragging(false); setDragPitch(null) }

  const handleRightClickNote = (e: React.MouseEvent, pitch: number, time: number, trackId: 'melody' | 'bass') => {
    e.preventDefault(); removeNote(pitch, time, trackId)
  }

  const handleClipDragStart = (clipId: string, e: React.MouseEvent) => { setDraggingClip(clipId); setDragOffsetX(e.clientX) }
  const handleClipDragMove = (e: React.MouseEvent) => {
    if (draggingClip) {
      const barDelta = Math.round((e.clientX - dragOffsetX) / 80)
      if (barDelta !== 0) { setClips(prev => prev.map(c => c.id === draggingClip ? { ...c, startBar: Math.max(0, c.startBar + barDelta) } : c)); setDragOffsetX(e.clientX) }
    }
  }
  const handleClipDragEnd = () => setDraggingClip(null)

  const toggleDrum = (trackIdx: number, step: number) => {
    setProject(prev => {
      const p = prev.tracks.drums.pattern.map((row, i) => i === trackIdx ? row.map((v, s) => s === step ? (v ? 0 : 1) : v) : row)
      return { ...prev, tracks: { ...prev.tracks, drums: { ...prev.tracks.drums, pattern: p } } }
    })
    setSelectionType('drum')
  }

  const handleRightClickDrum = (e: React.MouseEvent, trackIdx: number, step: number) => { e.preventDefault(); toggleDrum(trackIdx, step) }

  const updateChord = (barIndex: number, chordName: string) => {
    setProject(prev => {
      const newChords = [...prev.tracks.chords]
      if (chordName) newChords[barIndex] = { name: chordName, duration: newChords[barIndex]?.duration || 4 }
      else newChords.splice(barIndex, 1)
      return { ...prev, tracks: { ...prev.tracks, chords: newChords } }
    })
    if (chordName) addAIThought(`🎼 Bar ${barIndex + 1}: ${chordName}`)
  }

  const updateTrack = (id: string, updates: Partial<TrackState>) => setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))

  const newProject = () => { setProject(createEmptyProject()); setTotalBars(4); setAiThoughts([]); setAiSuggestions([]); setClips([]) }

  const quantizeNotes = () => {
    const gridSize = 16 / quantize
    setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, time: Math.round(n.time / gridSize) * gridSize })) } } }))
    addAIThought(`⌚ Quantized to 1/${quantize}`)
  }

  const transposeNotes = (semitones: number) => {
    setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: prev.tracks.melody.notes.map(n => ({ ...n, pitch: Math.min(127, Math.max(0, n.pitch + semitones)) })) } } }))
    addAIThought(semitones > 0 ? `⬆️ Transposed +${semitones}` : `⬇️ Transposed ${semitones}`)
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key.toLowerCase() === 'm') { e.preventDefault(); setIsMetronomeOn(v => !v) }
        return
      }
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'k': e.preventDefault(); setShowCommandPalette(v => !v); setCommandQuery(''); break
          case 's': e.preventDefault(); exportProject(); addAIThought('💾 Saved'); break
          case 'l': e.preventDefault(); setIsLooping(v => !v); break
          case 'g': e.preventDefault(); if (!isGenerating) generateWithAI(); break
        }
        return
      }
      switch (e.key) {
        case ' ': e.preventDefault(); isPlaying ? handleStop() : handlePlay(); break
        case 'Tab': e.preventDefault(); setView(v => v === 'pattern' ? 'arrange' : v === 'arrange' ? 'mix' : 'pattern'); break
        case '1': setSelectedTrackId('melody'); break
        case '2': setSelectedTrackId('bass'); break
        case '3': setSelectedTrackId('drums'); break
        case '4': setSelectedTrackId('chords'); break
        case 'm': if (selectedTrackId) setTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, muted: !t.muted } : t)); break
        case 's': if (selectedTrackId) setTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, solo: !t.solo } : t)); break
        case 'Delete': case 'Backspace': if (selectedNote) { removeNote(selectedNote.pitch, selectedNote.time); setSelectedNote(null) } break
        case 'q': setQuantize(q => q === 16 ? 8 : q === 8 ? 4 : q === 4 ? 2 : 16); break
        case '=': case '+': e.preventDefault(); setProject(p => ({ ...p, bpm: Math.min(200, p.bpm + 5) })); break
        case '-': e.preventDefault(); setProject(p => ({ ...p, bpm: Math.max(60, p.bpm - 5) })); break
        case 'h': setShowHotkeys(v => !v); break
        case 'Escape': setSelectedNote(null); setSelectionType('none'); setShowCommandPalette(false); setShowHotkeys(false); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, selectedTrackId, selectedNote, isGenerating, handlePlay, handleStop])

  useEffect(() => { audioEngine.setMasterVolume(volume) }, [volume])
  useEffect(() => { audioEngine.setBpm(project.bpm) }, [project.bpm])
  useEffect(() => { audioEngine.setSynthWaveform(synthWave); audioEngine.setDrumKit(drumKit); audioEngine.setReverbMix(reverbAmount) }, [synthWave, drumKit, reverbAmount])
  useEffect(() => {
    if (!isPlaying) { setFrequencyBars(Array(32).fill(0)); return }
    const id = setInterval(() => { const d = audioEngine.getFrequencyData(); setFrequencyBars(Array.from(d.slice(0, 32))) }, 50)
    return () => clearInterval(id)
  }, [isPlaying])

  const selectedTrack = tracks.find(t => t.id === selectedTrackId)

  // ─── Smart panel ───────────────────────────────────────────────────────
  const renderSmartPanel = () => {
    switch (selectionType) {
      case 'track': if (!selectedTrack) return null
        return (
          <div className="smart-panel">
            <h4>Track: {selectedTrack.name}</h4>
            <div className="panel-controls">
              <label>Volume <input type="range" min={0} max={1} step={0.01} value={selectedTrack.volume} onChange={e => selectedTrackId && updateTrack(selectedTrackId, { volume: +e.target.value })} /></label>
              <label>Pan <input type="range" min={-1} max={1} step={0.1} value={selectedTrack.pan} onChange={e => selectedTrackId && updateTrack(selectedTrackId, { pan: +e.target.value })} /></label>
            </div>
            <div className="panel-buttons">
              <button className={selectedTrack.muted ? 'active' : ''} onClick={() => selectedTrackId && updateTrack(selectedTrackId, { muted: !selectedTrack.muted })}>Mute</button>
              <button className={selectedTrack.solo ? 'active' : ''} onClick={() => selectedTrackId && updateTrack(selectedTrackId, { solo: !selectedTrack.solo })}>Solo</button>
            </div>
          </div>
        )
      case 'note':
        return (
          <div className="smart-panel">
            <h4>Note: {selectedNote ? getNoteName(selectedNote.pitch) : '—'}</h4>
            <div className="panel-controls">
              <label>Velocity
                <input type="range" min={1} max={127} value={selectedNote?.velocity || 100} onChange={e => {
                  if (!selectedNote) return
                  setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: prev.tracks.melody.notes.map(n => n.pitch === selectedNote.pitch && n.time === selectedNote.time ? { ...n, velocity: +e.target.value } : n) } } }))
                }} />
              </label>
              <label>Duration
                <input type="range" min={0.25} max={4} step={0.25} value={selectedNote?.duration || 1} onChange={e => {
                  if (!selectedNote) return
                  setProject(prev => ({ ...prev, tracks: { ...prev.tracks, melody: { notes: prev.tracks.melody.notes.map(n => n.pitch === selectedNote.pitch && n.time === selectedNote.time ? { ...n, duration: +e.target.value } : n) } } }))
                }} />
              </label>
            </div>
            <button className="delete-btn" onClick={() => selectedNote && removeNote(selectedNote.pitch, selectedNote.time)}>Delete Note</button>
          </div>
        )
      case 'drum':
        return (
          <div className="smart-panel">
            <h4>Drum Track</h4>
            <div className="panel-controls">
              <label>Kit <select value={drumKit} onChange={e => setDrumKit(e.target.value)}>{drumKits.map(k => <option key={k}>{k}</option>)}</select></label>
            </div>
          </div>
        )
      default:
        return (
          <div className="smart-panel">
            <h4>Project</h4>
            <div className="panel-controls">
              <label>BPM <input type="number" value={project.bpm} onChange={e => setProject(p => ({ ...p, bpm: +e.target.value || 120 }))} min={40} max={200} /></label>
              <label>Key <select value={currentKey} onChange={e => setCurrentKey(e.target.value)}>{chordOptions.map(c => <option key={c}>{c}</option>)}</select></label>
              <label>Mode <select value={currentMode} onChange={e => setCurrentMode(e.target.value)}>{modes.map(m => <option key={m}>{m}</option>)}</select></label>
              <label>Time
                <select value={project.timeSignature} onChange={e => setProject(p => ({ ...p, timeSignature: e.target.value }))}>
                  <option>4/4</option><option>3/4</option><option>6/8</option>
                </select>
              </label>
            </div>
          </div>
        )
    }
  }

  // ─── Pattern view ──────────────────────────────────────────────────────
  const renderPatternView = () => (
    <div className="pattern-view">
      <div className="track-sidebar">
        <div className="sidebar-header">
          <span>Tracks</span>
          <button className="add-track-btn">+</button>
        </div>
        <div className="track-list">
          {tracks.map((track, idx) => (
            <div key={track.id} className={`track-item ${selectedTrackId === track.id ? 'selected' : ''}`}
              onClick={() => { setSelectedTrackId(track.id); setSelectionType('track') }}>
              <div className="track-icon-wrap" style={{ background: track.color }}>{idx + 1}</div>
              <div className="track-info">
                <span className="track-name">{track.name}</span>
                <span className="track-type">{track.type}</span>
              </div>
              <div className="track-btns">
                <button className={track.muted ? 'active' : ''} onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}>M</button>
                <button className={track.solo ? 'active' : ''} onClick={e => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }}>S</button>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-tools">
          <button className="tool-btn">🎹</button>
          <button className="tool-btn">🥁</button>
          <button className="tool-btn">🎤</button>
        </div>
      </div>

      <div className="grid-container">
        {/* ── Grid header with step numbers ── */}
        <div className="grid-header">
          {Array(totalBars * 16).fill(0).map((_, i) => (
            <div key={i} className={`grid-step-header${i === currentBeat ? ' playing' : ''}${i % 4 === 0 ? ' beat' : ''}`}>
              {i % 16 === 0 && <span className="step-label">{Math.floor(i / 16) + 1}</span>}
            </div>
          ))}
        </div>

        {/* ── Track grids ── */}
        <div className="grid-scroll" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          {tracks.map(track => (
            <div key={track.id} className="track-grid" style={{ borderLeft: `3px solid ${track.color}` }}>

              {/* Melody / Bass piano roll */}
              {(track.type === 'melody' || track.type === 'bass') && (
                <div className="piano-grid">
                  {Array(totalRows).fill(0).map((_, row) => {
                    const pitch = 84 - row
                    const isBlack = isBlackKey(pitch)
                    const trackNotes = track.id === 'bass' ? project.tracks.bass?.notes ?? [] : project.tracks.melody.notes
                    return (
                      <div key={row} className={`piano-row ${isBlack ? 'black-row' : 'white-row'}`}>
                        <span className="note-label">{getNoteName(pitch)}</span>
                        {Array(totalBars * 16).fill(0).map((_, step) => {
                          const note = trackNotes.find(n => n.pitch === pitch && Math.floor(n.time) === step)
                          // FIX: use step === currentBeat (not step % 16)
                          const isActive = step === currentBeat
                          return (
                            <div
                              key={step}
                              className={`grid-cell${isActive ? ' playing' : ''}`}
                              onMouseDown={() => handleMouseDown(pitch, step)}
                              onMouseEnter={() => handleMouseEnter(pitch, step)}
                              onMouseUp={handleMouseUp}
                              onContextMenu={e => handleRightClickNote(e, pitch, step, track.id === 'bass' ? 'bass' : 'melody')}
                              style={note ? {
                                backgroundColor: track.color,
                                opacity: 0.4 + (note.velocity / 127) * 0.6,
                                boxShadow: `0 0 ${Math.round(note.velocity / 127 * 8)}px ${track.color}`,
                                cursor: 'pointer',
                                border: '1px solid rgba(255,255,255,0.3)',
                              } : { cursor: 'crosshair' }}
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Drum sequencer */}
              {track.type === 'drums' && (
                <div className="drum-grid">
                  {['kick', 'snare', 'hihat'].map((drum, idx) => (
                    <div key={drum} className="drum-row">
                      <span className="drum-label">{drum}</span>
                      {Array(totalBars * 16).fill(0).map((_, step) => {
                        // FIX: use step === currentBeat (not step % 16)
                        const isActive = step === currentBeat
                        const isOn = project.tracks.drums.pattern[idx]?.[step % 16] === 1
                        return (
                          <button
                            key={step}
                            className={`drum-cell${isOn ? ' active' : ''}${isActive ? ' playing' : ''}`}
                            onClick={() => toggleDrum(idx, step % 16)}
                            onContextMenu={e => handleRightClickDrum(e, idx, step % 16)}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* Chord track */}
              {track.type === 'chords' && (
                <div className="chord-track">
                  {Array(totalBars).fill(0).map((_, bar) => {
                    const barChord = project.tracks.chords[bar]
                    return (
                      <div key={bar} className="chord-block">
                        <select className="chord-select" value={barChord?.name || ''} onChange={e => updateChord(bar, e.target.value)}>
                          <option value="">— chord —</option>
                          {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(note => (
                            <optgroup key={note} label={note}>
                              {[note, note+'m', note+'7', note+'maj7', note+'m7', note+'dim', note+'aug'].map(ch => (
                                <option key={ch} value={ch}>{ch}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {barChord && <button className="chord-delete" onClick={e => { e.stopPropagation(); updateChord(bar, '') }}>✕</button>}
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

  // ─── Arrangement view ──────────────────────────────────────────────────
  const renderArrangementView = () => (
    <div className="arrangement-view">
      <div className="arrangement-tracks">
        {tracks.map(track => (
          <div key={track.id} className="arrangement-track-lane" style={{ borderLeft: `3px solid ${track.color}` }}>
            <div className="lane-header">{track.name}</div>
            <div className="lane-content">
              <div className="timeline-ruler">
                {Array(totalBars).fill(0).map((_, bar) => <div key={bar} className="bar-marker">{bar + 1}</div>)}
              </div>
              <div className="lane-grid" onMouseMove={handleClipDragMove} onMouseUp={handleClipDragEnd} onMouseLeave={handleClipDragEnd}>
                {clips.filter(c => c.trackId === track.id).map(clip => (
                  <div key={clip.id} className="clip-block" style={{ left: clip.startBar * 80, width: clip.duration * 80, backgroundColor: clip.color }} onMouseDown={e => handleClipDragStart(clip.id, e)}>
                    {(clip.data as Record<string,string>)?.name || track.name}
                  </div>
                ))}
                {track.type === 'melody' && project.tracks.melody.notes.map((note, i) => (
                  <div key={i} className="note-block" style={{ left: Math.floor(note.time / 16) * 80 + (note.time % 16) / 16 * 80, backgroundColor: track.color }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ─── Mix view ──────────────────────────────────────────────────────────
  const renderMixView = () => (
    <div className="mix-view">
      <div className="mixer-strip">
        {tracks.map(track => (
          <div key={track.id} className="channel-strip">
            <div className="channel-name" style={{ color: track.color }}>{track.name}</div>
            <div className="channel-meter">
              <div className="meter-bar" style={{ height: isPlaying ? `${40 + Math.random() * 30}%` : '5%' }} />
              <div className="meter-bar" style={{ height: isPlaying ? `${35 + Math.random() * 25}%` : '5%' }} />
            </div>
            <div className="channel-controls">
              <button className={track.muted ? 'active' : ''} onClick={() => updateTrack(track.id, { muted: !track.muted })}>M</button>
              <button className={track.solo ? 'active' : ''} onClick={() => updateTrack(track.id, { solo: !track.solo })}>S</button>
            </div>
            <div className="channel-fader">
              <input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={e => updateTrack(track.id, { volume: +e.target.value })} />
              <span>{Math.round(track.volume * 100)}%</span>
            </div>
            <div className="channel-pan">
              <input type="range" min={-1} max={1} step={0.1} value={track.pan} onChange={e => updateTrack(track.id, { pan: +e.target.value })} />
              <span>Pan</span>
            </div>
          </div>
        ))}
        <div className="channel-strip master">
          <div className="channel-name">Master</div>
          <div className="channel-fader">
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(+e.target.value)} />
            <span>{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── Flow view ─────────────────────────────────────────────────────────
  const renderFlowView = () => (
    <div className="flow-view">
      <div className="routing-graph">
        <div className="flow-nodes">
          {tracks.map(track => (
            <div key={track.id} className="flow-node" style={{ borderColor: track.color }}>
              <div className="node-header" style={{ background: track.color }}>{track.name}</div>
              <div className="node-controls">
                <label>Vol <input type="range" min={0} max={1} step={0.01} value={audioRouting[track.id as keyof typeof audioRouting]?.volume ?? 0.8} onChange={e => setAudioRouting(prev => ({ ...prev, [track.id]: { ...prev[track.id as keyof typeof audioRouting], volume: +e.target.value } }))} /></label>
                <label>Pan <input type="range" min={-1} max={1} step={0.1} value={audioRouting[track.id as keyof typeof audioRouting]?.pan ?? 0} onChange={e => setAudioRouting(prev => ({ ...prev, [track.id]: { ...prev[track.id as keyof typeof audioRouting], pan: +e.target.value } }))} /></label>
              </div>
              <div className="node-effects">
                {audioRouting[track.id as keyof typeof audioRouting]?.effects?.map((fx, i) => <span key={i} className="effect-badge">{fx}</span>)}
              </div>
            </div>
          ))}
        </div>
        <div className="flow-output">
          <div className="output-node">🎛️ Master Output</div>
          <div className="flow-line" />
          <div className="frequency-visualizer">
            {frequencyBars.map((v, i) => <div key={i} className="freq-bar" style={{ height: `${v}%` }} />)}
          </div>
        </div>
      </div>
    </div>
  )

  // ─── Command palette ───────────────────────────────────────────────────
  const commands = [
    { id: 'play',    label: 'Play / Pause',              action: () => isPlaying ? handleStop() : handlePlay() },
    { id: 'stop',    label: 'Stop',                       action: handleStop },
    { id: 'gen',     label: 'Generate with AI',           action: () => { setShowAI(true); generateWithAI() } },
    { id: 'clear',   label: 'Clear Melody',               action: () => setProject(p => ({ ...p, tracks: { ...p.tracks, melody: { notes: [] } } })) },
    { id: 'pattern', label: 'Pattern View',               action: () => setView('pattern') },
    { id: 'arrange', label: 'Arrange View',               action: () => setView('arrange') },
    { id: 'mix',     label: 'Mix View',                   action: () => setView('mix') },
    { id: 'bpm+',    label: 'BPM +10',                    action: () => setProject(p => ({ ...p, bpm: Math.min(200, p.bpm + 10) })) },
    { id: 'bpm-',    label: 'BPM -10',                    action: () => setProject(p => ({ ...p, bpm: Math.max(60, p.bpm - 10) })) },
  ]
  const filteredCmds = commands.filter(c => c.label.toLowerCase().includes(commandQuery.toLowerCase()))

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {showCommandPalette && (
        <div className="command-palette-overlay" onClick={() => setShowCommandPalette(false)}>
          <div className="command-palette" onClick={e => e.stopPropagation()}>
            <input className="command-input" placeholder="Type a command…" value={commandQuery} onChange={e => setCommandQuery(e.target.value)} autoFocus />
            <div className="command-list">
              {filteredCmds.map(cmd => <div key={cmd.id} className="command-item" onClick={() => { cmd.action(); setShowCommandPalette(false) }}>{cmd.label}</div>)}
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
                <div className="hotkey-row"><kbd>SPACE</kbd><span>Play / Stop</span></div>
                <div className="hotkey-row"><kbd>Ctrl+L</kbd><span>Toggle Loop</span></div>
              </div>
              <div className="hotkeys-section">
                <h3>🎹 Editing</h3>
                <div className="hotkey-row"><kbd>1–4</kbd><span>Select Track</span></div>
                <div className="hotkey-row"><kbd>M</kbd><span>Mute Track</span></div>
                <div className="hotkey-row"><kbd>S</kbd><span>Solo Track</span></div>
                <div className="hotkey-row"><kbd>Delete</kbd><span>Delete Note</span></div>
                <div className="hotkey-row"><kbd>Q</kbd><span>Cycle Quantize</span></div>
              </div>
              <div className="hotkeys-section">
                <h3>🎚️ Parameters</h3>
                <div className="hotkey-row"><kbd>+/=</kbd><span>BPM +5</span></div>
                <div className="hotkey-row"><kbd>-</kbd><span>BPM -5</span></div>
              </div>
              <div className="hotkeys-section">
                <h3>🤖 AI & Project</h3>
                <div className="hotkey-row"><kbd>Ctrl+G</kbd><span>Generate AI</span></div>
                <div className="hotkey-row"><kbd>Ctrl+S</kbd><span>Save</span></div>
                <div className="hotkey-row"><kbd>Ctrl+K</kbd><span>Command Palette</span></div>
                <div className="hotkey-row"><kbd>TAB</kbd><span>Switch View</span></div>
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

      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo"><span className="logo-icon">♪</span><h1>BeatMaker Pro</h1></div>
          <span className="project-name" onClick={() => { const n = prompt('Project name:', project.name); if (n) setProject(p => ({ ...p, name: n })) }}>{project.name}</span>
        </div>

        <div className="header-center">
          <div className="transport">
            <button className="transport-btn stop" onClick={handleStop}>
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
            </button>
            <button className={`transport-btn play${isPlaying ? ' playing' : ''}`} onClick={isPlaying ? handleStop : handlePlay}>
              {isPlaying
                ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>}
            </button>
          </div>

          <div className="time-display">
            <span className="time-bar">{String(Math.floor(currentBeat / 16) + 1).padStart(2, '0')}</span>
            <span className="time-sep">:</span>
            <span className="time-beat">{String(Math.floor((currentBeat % 16) / 4) + 1)}</span>
            <span className="time-sep">:</span>
            <span className="time-step">{currentBeat % 4}</span>
          </div>

          <div className="loop-section">
            <button className={`loop-btn${isLooping ? ' active' : ''}`} onClick={() => setIsLooping(!isLooping)}>🔁</button>
            <button className={`metronome-btn${isMetronomeOn ? ' active' : ''}`} onClick={() => setIsMetronomeOn(!isMetronomeOn)}>♩</button>
          </div>
        </div>

        <div className="header-right">
          <div className="view-tabs">
            {(['pattern','arrange','mix','flow'] as ViewMode[]).map(v => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
            ))}
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

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-group">
          <div className="param-control">
            <label>BPM</label>
            <input type="number" value={project.bpm} onChange={e => setProject(p => ({ ...p, bpm: +e.target.value || 120 }))} min={40} max={200} />
          </div>
          <div className="param-control">
            <label>Key</label>
            <select value={currentKey} onChange={e => setCurrentKey(e.target.value)}>{chordOptions.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="param-control">
            <label>Mode</label>
            <select value={currentMode} onChange={e => setCurrentMode(e.target.value)}>{modes.map(m => <option key={m}>{m}</option>)}</select>
          </div>
          <div className="param-control">
            <label>Genre</label>
            <select value={genre} onChange={e => { setGenre(e.target.value); const p = genrePresets[e.target.value]; if (p) setProject(prev => ({ ...prev, bpm: p.bpm })) }}>
              {genres.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase()+g.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div className="timeline-bar">
          {Array(totalBars).fill(0).map((_, bar) => (
            <div key={bar} className={`timeline-bar-segment${Math.floor(currentBeat / 16) === bar ? ' active' : ''}`}>
              <span className="bar-number">{bar + 1}</span>
              <div className="beat-dots">
                {Array(4).fill(0).map((_, beat) => (
                  <div key={beat} className={`beat-dot${Math.floor(currentBeat / 4) === bar * 4 + beat ? ' active' : ''}`} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar-group right">
          <div className="param-control small">
            <label>Bars</label>
            <input type="number" value={totalBars} onChange={e => setTotalBars(Math.max(1, Math.min(64, +e.target.value || 4)))} min={1} max={64} />
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={autoGenerate} onChange={e => setAutoGenerate(e.target.checked)} />
            <span>Auto-AI</span>
          </label>
        </div>
      </div>

      {/* ── Workspace ── */}
      <div className="workspace">
        <div className="main-area">
          {view === 'pattern'  && renderPatternView()}
          {view === 'arrange'  && renderArrangementView()}
          {view === 'mix'      && renderMixView()}
          {view === 'flow'     && renderFlowView()}
        </div>

        <div className="smart-panel-container">{renderSmartPanel()}</div>

        {showAI && (
          <div className="ai-panel">
            <div className="panel-header">
              <h3>🤖 AI Assistant</h3>
              <button className="close-btn" onClick={() => setShowAI(false)}>×</button>
            </div>
            <div className="ai-content">
              <div className="ai-status-bar">
                <div className={`status-indicator ${isGenerating ? 'generating' : 'idle'}`}>
                  {isGenerating ? '🤖 Generating…' : '✨ Ready'}
                </div>
              </div>
              <div className="ai-thoughts">
                {aiThoughts.length === 0 && <div className="thought-empty">Type a prompt or click Generate</div>}
                {[...aiThoughts].reverse().map(t => <div key={t.id} className="thought-bubble">{t.text}</div>)}
              </div>
              <div className="ai-input">
                <input type="password" placeholder="OpenRouter API Key (optional)" value={apiKey} onChange={e => setApiKey(e.target.value)} onBlur={saveApiKey} disabled={isLoadingKey} />
                <input
                  type="text"
                  className="intent-input"
                  placeholder="add bass line, faster, darker, clear…"
                  value={intentInput}
                  onChange={e => setIntentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') generateWithIntent(intentInput) }}
                />
                <button className="ai-generate-btn" onClick={() => intentInput ? generateWithIntent(intentInput) : generateWithAI()} disabled={isGenerating}>
                  {isGenerating ? '⏳ Working…' : '🚀 Generate'}
                </button>
              </div>
              {aiSuggestions.length > 0 && (
                <div className="ai-suggestions">
                  <h4>Last generation:</h4>
                  {aiSuggestions.map((s, i) => <span key={i} className="suggestion-chip">{s}</span>)}
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
                <h4>Synth Waveform</h4>
                <div className="sound-grid">
                  {waveforms.map(w => <button key={w} className={`sound-pad${synthWave === w ? ' active' : ''}`} onClick={() => setSynthWave(w)}><span className="pad-name">{w}</span></button>)}
                </div>
              </div>
              <div className="sound-section">
                <h4>Drum Kit</h4>
                <div className="sound-grid">
                  {drumKits.map(k => <button key={k} className={`sound-pad${drumKit === k ? ' active' : ''}`} onClick={() => setDrumKit(k)}><span className="pad-name">{k}</span></button>)}
                </div>
              </div>
              <div className="sound-section">
                <h4>Effects</h4>
                <div className="effect-knob">
                  <label>Reverb</label>
                  <input type="range" min={0} max={0.5} step={0.01} value={reverbAmount} onChange={e => setReverbAmount(+e.target.value)} />
                  <span>{Math.round(reverbAmount * 100)}%</span>
                </div>
                <div className="effect-knob">
                  <label>Note Velocity</label>
                  <input type="range" min={40} max={127} value={noteVelocity} onChange={e => setNoteVelocity(+e.target.value)} />
                  <span>{noteVelocity}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="quick-actions">
        <button onClick={() => selectedNote && removeNote(selectedNote.pitch, selectedNote.time)} disabled={!selectedNote}>Delete</button>
        <button onClick={duplicateSelectedNote} disabled={!selectedNote}>Duplicate</button>
        <button onClick={quantizeNotes}>Quantize 1/{quantize}</button>
        <button onClick={() => transposeNotes(1)}>↑ +1</button>
        <button onClick={() => transposeNotes(-1)}>↓ -1</button>
        <span className="action-hint">Space: play • Tab: view • 1-4: track • Ctrl+G: AI • H: help</span>
      </div>

      {/* ── Footer ── */}
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
          <div className="keyboard-hint">Space: Play/Stop · Tab: Views · 1-4: Tracks · M: Mute · S: Solo · Ctrl+G: AI Generate</div>
        </div>
        <div className="footer-right">
          <div className="track-stats">
            <span>🎵 {project.tracks.melody.notes.length} notes</span>
            <span>🥁 {project.tracks.drums.pattern[0]?.filter(x => x).length ?? 0} beats</span>
            <span>📐 {totalBars} bars</span>
          </div>
          <div className="master-volume">
            <label>Vol</label>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(+e.target.value)} />
            <span>{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
