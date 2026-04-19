import { Project } from '../shared/types'

export interface Track {
  id: string
  name: string
  type: 'melody' | 'drums' | 'chords' | 'bass'
  muted: boolean
  solo: boolean
  volume: number
  pan: number
  color: string
  armed: boolean
}

export interface DrumTrack {
  kit: string
  pattern: number[][]
}

export interface UIState {
  view: 'arrange' | 'mix' | 'pattern'
  selectedTrackId: string | null
  selectedNoteId: string | null
  zoom: number
  scrollPosition: number
  showSounds: boolean
  showAI: boolean
  showMixer: boolean
}

export const createEmptyProject = (): Project => ({
  version: '1.0',
  name: 'Untitled',
  bpm: 120,
  timeSignature: '4/4',
  tracks: {
    melody: { notes: [] },
    drums: { kit: 'default', pattern: Array(3).fill(null).map(() => Array(16).fill(0)) },
    chords: []
  }
})

export const defaultTracks: Track[] = [
  { id: 'melody', name: 'Synth', type: 'melody', muted: false, solo: false, volume: 0.8, pan: 0, color: '#00a8e8', armed: false },
  { id: 'bass', name: 'Bass', type: 'bass', muted: false, solo: false, volume: 0.8, pan: 0, color: '#48dbfb', armed: false },
  { id: 'drums', name: 'Drums', type: 'drums', muted: false, solo: false, volume: 0.8, pan: 0, color: '#ff6b6b', armed: false },
  { id: 'chords', name: 'Pad', type: 'chords', muted: false, solo: false, volume: 0.8, pan: 0, color: '#feca57', armed: false }
]

export const defaultUIState: UIState = {
  view: 'pattern',
  selectedTrackId: 'melody',
  selectedNoteId: null,
  zoom: 1,
  scrollPosition: 0,
  showSounds: false,
  showAI: true,
  showMixer: false
}

export const genrePresets: Record<string, { scale: number[], chordProgression: string[], drumPattern: number[][], bpm: number }> = {
  pop: {
    scale: [60, 62, 64, 65, 67, 69, 71, 72],
    chordProgression: ['C', 'G', 'Am', 'F'],
    drumPattern: [[1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]],
    bpm: 120
  },
  edm: {
    scale: [60, 62, 64, 67, 70, 72],
    chordProgression: ['C', 'F', 'G', 'C'],
    drumPattern: [[1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]],
    bpm: 128
  },
  lofi: {
    scale: [60, 62, 63, 65, 67, 70, 72],
    chordProgression: ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    drumPattern: [[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1]],
    bpm: 85
  },
  trap: {
    scale: [58, 60, 62, 63, 66, 70, 72],
    chordProgression: ['Cm', 'Ab', 'Bb', 'Gm'],
    drumPattern: [[1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1]],
    bpm: 140
  },
  rock: {
    scale: [60, 62, 64, 65, 67, 69, 71, 72],
    chordProgression: ['G', 'C', 'D', 'G'],
    drumPattern: [[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]],
    bpm: 120
  },
  jazz: {
    scale: [60, 62, 63, 65, 67, 69, 70, 72],
    chordProgression: ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'],
    drumPattern: [[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]],
    bpm: 110
  }
}

export const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const getNoteName = (pitch: number): string => {
  return noteNames[pitch % 12] + String(Math.floor(pitch / 12) - 1)
}

export const isBlackKey = (pitch: number): boolean => {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}