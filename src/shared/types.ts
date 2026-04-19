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

export interface DrumTrack {
  kit: string
  pattern: (number | null)[][]
}

export interface Chord {
  name: string
  duration: number
}

export interface MelodyTrack {
  notes: Note[]
}

export interface Track {
  melody?: MelodyTrack
  drums?: DrumTrack
  chords?: Chord[]
  bass?: MelodyTrack
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