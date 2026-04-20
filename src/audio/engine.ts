export type Note = {
  pitch: number
  time: number
  duration: number
  velocity: number
}

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle'

export interface SynthSound {
  waveform: OscillatorType
  filterCutoff: number
  filterResonance: number
  attack: number
  decay: number
  sustain: number
  release: number
}

export interface DrumKitConfig {
  name: string
  samples: Record<string, { freq: number; decay: number; type: string }>
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private reverbNode: ConvolverNode | null = null
  private analyserNode: AnalyserNode | null = null
  private bpm = 120
  private synthWaveform: OscillatorType = 'sawtooth'
  private drumKit: string = 'default'
  private reverbMix = 0.22

  // Per-track sound settings - improved for richer sound
  private melodySound: SynthSound = { waveform: 'sawtooth', filterCutoff: 6000, filterResonance: 3.5, attack: 0.008, decay: 0.4, sustain: 0.65, release: 0.7 }
  private bassSound: SynthSound = { waveform: 'square', filterCutoff: 2500, filterResonance: 1.8, attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.4 }
  private drumKitConfig: DrumKitConfig = { 
    name: 'default', 
    samples: {
      kick: { freq: 60, decay: 0.4, type: 'sine' },
      snare: { freq: 200, decay: 0.2, type: 'noise' },
      hihat: { freq: 800, decay: 0.08, type: 'noise' },
      clap: { freq: 400, decay: 0.15, type: 'noise' },
      tom: { freq: 120, decay: 0.3, type: 'sine' },
      openhat: { freq: 600, decay: 0.4, type: 'noise' }
    } 
  }

  private sampleBuffers: Map<string, AudioBuffer> = new Map()

  async init() {
    if (this.ctx) return
    
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.65

    this.analyserNode = this.ctx.createAnalyser()
    this.analyserNode.fftSize = 256

    await this.createReverb()
    await this.loadDrumSamples()
    
    this.masterGain.connect(this.analyserNode)
    this.analyserNode.connect(this.ctx.destination)
  }

  private async createReverb() {
    if (!this.ctx) return
    
    this.reverbNode = this.ctx.createConvolver()
    const rate = this.ctx.sampleRate
    const length = rate * 2
    const impulse = this.ctx.createBuffer(2, length, rate)
    
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5)
      }
    }
    this.reverbNode.buffer = impulse
  }

  private async loadDrumSamples() {
    if (!this.ctx) return
    
    const drumConfigs = [
      { name: 'kick', freq: 60, decay: 0.4, type: 'sine' },
      { name: 'snare', freq: 200, decay: 0.2, type: 'noise' },
      { name: 'hihat', freq: 800, decay: 0.08, type: 'noise' },
      { name: 'clap', freq: 400, decay: 0.15, type: 'noise' },
      { name: 'tom', freq: 120, decay: 0.3, type: 'sine' },
      { name: 'openhat', freq: 600, decay: 0.4, type: 'noise' }
    ]

    for (const drum of drumConfigs) {
      await this.generateDrumSample(drum)
    }
  }

  private async generateDrumSample(config: { name: string; freq: number; decay: number; type: string }) {
    if (!this.ctx) return
    
    const sampleRate = this.ctx.sampleRate
    const duration = config.decay * 3
    const buffer = this.ctx.createBuffer(2, sampleRate * duration, sampleRate)
    
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate
        let sample = 0
        
        if (config.type === 'sine') {
          const freqEnv = config.freq * Math.exp(-t * 15)
          sample = Math.sin(2 * Math.PI * freqEnv * t) * Math.exp(-t / config.decay)
        } else {
          const noise = Math.random() * 2 - 1
          const envelope = Math.exp(-t / (config.decay * 0.5))
          const highpass = Math.sin(2 * Math.PI * config.freq * t)
          sample = noise * envelope * 0.3 + highpass * noise * envelope * 0.2
        }
        
        data[i] = sample * 0.8
      }
    }
    
    this.sampleBuffers.set(config.name, buffer)
  }

  setBpm(_bpm: number) {
    this.bpm = _bpm
  }

  setSynthWaveform(value: OscillatorType) {
    this.synthWaveform = value
  }

  setDrumKit(value: string) {
    this.drumKit = value
  }

  setReverbMix(value: number) {
    this.reverbMix = Math.min(0.5, Math.max(0, value))
  }

  getCurrentTime() {
    return this.ctx?.currentTime ?? 0
  }

  noteToFrequency(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12)
  }

  playNote(note: Note, startTime = 0, gain = 1) {
    if (!this.ctx || !this.masterGain) return

    const vel = note.velocity / 127
    const sound = this.melodySound
    
    // Better synth: 3 oscillators for richer sound
    const osc1 = this.ctx.createOscillator()
    const osc2 = this.ctx.createOscillator()
    const osc3 = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const noteGain = this.ctx.createGain()
    const ampEnv = this.ctx.createGain()
    
    const freq = this.noteToFrequency(note.pitch)

    osc1.type = sound.waveform
    osc1.frequency.value = freq
    osc1.detune.value = 7
    
    osc2.type = sound.waveform === 'sine' ? 'triangle' : 'sawtooth'
    osc2.frequency.value = freq * 2.01  // Octave up for harmonics
    osc2.detune.value = -5
    
    osc3.type = 'sine'
    osc3.frequency.value = freq * 0.5  // Sub-octave
    osc3.detune.value = 0

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(sound.filterCutoff + vel * 2000, this.ctx.currentTime + startTime)
    
    const dur = note.duration * (60 / this.bpm) * 0.8
    
    filter.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + startTime + dur * 0.5)
    filter.Q.value = sound.filterResonance

    const now = this.ctx.currentTime + startTime

    const targetGain = Math.max(0.1, vel * 0.5) * gain

    noteGain.gain.setValueAtTime(0.0001, now)
    noteGain.gain.exponentialRampToValueAtTime(targetGain, now + sound.attack)
    noteGain.gain.linearRampToValueAtTime(targetGain * sound.sustain, now + dur * 0.3)
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    ampEnv.gain.value = 1

    osc1.connect(filter)
    osc2.connect(filter)
    osc3.connect(filter)
    filter.connect(noteGain)
    noteGain.connect(ampEnv)
    ampEnv.connect(this.masterGain)

    if (this.reverbNode) {
      const reverbGain = this.ctx.createGain()
      reverbGain.gain.value = 0.18
      ampEnv.connect(this.reverbNode)
      this.reverbNode.connect(reverbGain)
      reverbGain.connect(this.masterGain)
    }

    osc1.start(now)
    osc2.start(now)
    osc3.start(now)
    osc1.stop(now + dur)
    osc2.stop(now + dur)
    osc3.stop(now + dur)
  }

  playDrum(sampleName: string, time: number, velocity = 1) {
    if (!this.ctx || !this.masterGain) return

    const buffer = this.sampleBuffers.get(sampleName)
    if (!buffer) return

    const source = this.ctx.createBufferSource()
    const gain = this.ctx.createGain()
    const lowpass = this.ctx.createBiquadFilter()
    const pan = this.ctx.createStereoPanner()

    source.buffer = buffer
    lowpass.type = 'lowpass'
    lowpass.frequency.value = sampleName === 'hihat' ? 10000 : sampleName === 'kick' ? 2500 : 4500

    const kitBoost = this.drumKit === 'electro' ? 1.15 : this.drumKit === 'acoustic' ? 0.85 : 1
    const mixPan = sampleName === 'hihat' ? 0.65 : sampleName === 'snare' ? 0.25 : 0

    gain.gain.setValueAtTime(Math.max(0.18, velocity * 0.8 * kitBoost), this.ctx.currentTime + time)
    pan.pan.value = this.drumKit === 'electro' ? mixPan * 1.1 : mixPan

    source.connect(lowpass)
    lowpass.connect(gain)
    gain.connect(pan)
    pan.connect(this.masterGain)

    if (this.reverbNode && sampleName !== 'kick') {
      const reverbSend = this.ctx.createGain()
      reverbSend.gain.value = this.reverbMix
      gain.connect(this.reverbNode)
      this.reverbNode.connect(reverbSend)
      reverbSend.connect(this.masterGain)
    }

    source.start(this.ctx.currentTime + time)
  }

  setMasterVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume
    }
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(data)
    return data
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode
  }

  getContext() {
    return this.ctx
  }

  async resume() {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  // Sound setters
  setMelodySound(sound: Partial<SynthSound>) {
    this.melodySound = { ...this.melodySound, ...sound }
  }
  getMelodySound(): SynthSound {
    return this.melodySound
  }
  setBassSound(sound: Partial<SynthSound>) {
    this.bassSound = { ...this.bassSound, ...sound }
  }
  getBassSound(): SynthSound {
    return this.bassSound
  }
  setDrumKitConfig(config: DrumKitConfig) {
    this.drumKitConfig = config
  }
  getDrumKitConfig(): DrumKitConfig {
    return this.drumKitConfig
  }

  stopAll() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend()
    }
  }

  resumePlayback() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }
}

export const audioEngine = new AudioEngine()
export default audioEngine