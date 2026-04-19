export type Note = {
  pitch: number
  time: number
  duration: number
  velocity: number
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private reverbNode: ConvolverNode | null = null
  private analyserNode: AnalyserNode | null = null
  private bpm = 120
  private synthWaveform: OscillatorType = 'sawtooth'
  private drumKit: string = 'default'
  private reverbMix = 0.18

  private sampleBuffers: Map<string, AudioBuffer> = new Map()

  async init() {
    if (this.ctx) return
    
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.7

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
    
    const osc1 = this.ctx.createOscillator()
    const osc2 = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const noteGain = this.ctx.createGain()
    const ampEnv = this.ctx.createGain()

    osc1.type = this.synthWaveform
    osc1.frequency.value = this.noteToFrequency(note.pitch)
    osc1.detune.value = this.synthWaveform === 'square' ? 8 : 6
    
    osc2.type = this.synthWaveform === 'sine' ? 'triangle' : 'sine'
    osc2.frequency.value = this.noteToFrequency(note.pitch) * (this.synthWaveform === 'square' ? 0.49 : 0.51)
    osc2.detune.value = this.synthWaveform === 'square' ? -8 : -5

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(3000 + vel * 1600, this.ctx.currentTime + startTime)
    
    const dur = note.duration * (60 / this.bpm) * 0.75
    
    filter.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + startTime + dur * 0.45)
    filter.Q.value = this.synthWaveform === 'triangle' ? 1.8 : 1.4

    const now = this.ctx.currentTime + startTime

    const targetGain = Math.max(0.08, vel * 0.35) * gain

    noteGain.gain.setValueAtTime(0.0001, now)
    noteGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.02)
    noteGain.gain.linearRampToValueAtTime(Math.max(0.02, vel * 0.22) * gain, now + dur * 0.35)
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    ampEnv.gain.value = 1

    osc1.connect(filter)
    osc2.connect(filter)
    filter.connect(noteGain)
    noteGain.connect(ampEnv)
    ampEnv.connect(this.masterGain)

    if (this.reverbNode) {
      const reverbGain = this.ctx.createGain()
      reverbGain.gain.value = 0.16
      ampEnv.connect(this.reverbNode)
      this.reverbNode.connect(reverbGain)
      reverbGain.connect(this.masterGain)
    }

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + dur)
    osc2.stop(now + dur)
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
}

export const audioEngine = new AudioEngine()
export default audioEngine