export interface Note {
  pitch: number
  time: number
  duration: number
  velocity: number
}

export interface DrumStep {
  sample: string
  velocity: number
}

export interface DrumKit {
  name: string
  samples: Record<string, { freq: number; decay: number; type: string }>
}

export interface DrumTrack {
  kit: string
  pattern: (number | null)[][]
  customKit?: DrumKit
}

export interface SynthSound {
  waveform: OscillatorType
  filterCutoff: number
  filterResonance: number
  attack: number
  decay: number
  sustain: number
  release: number
}

export interface Chord {
  name: string
  duration: number
}

export interface MelodyTrack {
  notes: Note[]
  sound?: SynthSound
}

export interface Track {
  melody?: MelodyTrack
  drums?: DrumTrack
  chords?: Chord[]
  bass?: MelodyTrack
  id: string
  name: string
  type: 'melody' | 'drums' | 'bass' | 'chords'
  color: string
  volume: number
  pan: number
  muted: boolean
  solo: boolean
}

export interface Project {
  version: string
  name: string
  bpm: number
  timeSignature: string
  tracks: {
    melody: MelodyTrack
    drums: DrumTrack
    chords: Chord[]
    bass?: MelodyTrack
  }
}

export interface ElectronAPI {
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, value: any) => Promise<void>
  saveProject: (data: string, defaultName: string) => Promise<string | null>
  openProject: () => Promise<string | null>
  writeFile: (filePath: string, data: string) => Promise<void>
  readFile: (filePath: string) => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}