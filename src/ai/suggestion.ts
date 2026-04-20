export interface AISuggestion {
  melody: {
    notes: Array<{ pitch: number; time: number; duration: number; velocity: number }>
  }
  drums: {
    pattern: number[][]
  }
  chords: Array<{ name: string; duration: number }>
}

// Scale definitions as semitone offsets from root
const SCALES: Record<string, number[]> = {
  major:       [0, 2, 4, 5, 7, 9, 11],
  minor:       [0, 2, 3, 5, 7, 8, 10],
  dorian:      [0, 2, 3, 5, 7, 9, 10],
  mixolydian:  [0, 2, 4, 5, 7, 9, 10],
  pentatonic:  [0, 2, 4, 7, 9],
  blues:       [0, 3, 5, 6, 7, 10],
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function getScaleNotes(rootName: string, mode: string, octaveMin = 3, octaveMax = 6): number[] {
  const rootIdx = NOTE_NAMES.indexOf(rootName)
  if (rootIdx === -1) return getScaleNotes('C', mode, octaveMin, octaveMax)
  const offsets = SCALES[mode] || SCALES.major
  const notes: number[] = []
  for (let oct = octaveMin; oct <= octaveMax; oct++) {
    const base = (oct + 1) * 12  // MIDI: C4 = 60
    for (const off of offsets) {
      const midi = base + rootIdx + off
      if (midi >= 36 && midi <= 96) notes.push(midi)
    }
  }
  return [...new Set(notes)].sort((a, b) => a - b)
}

function validateNote(n: unknown): n is { pitch: number; time: number; duration: number; velocity: number } {
  if (!n || typeof n !== 'object') return false
  const obj = n as Record<string, unknown>
  return (
    typeof obj.pitch === 'number' && obj.pitch >= 21 && obj.pitch <= 108 &&
    typeof obj.time === 'number' && obj.time >= 0 &&
    typeof obj.duration === 'number' && obj.duration > 0 && obj.duration <= 16 &&
    typeof obj.velocity === 'number' && obj.velocity >= 1 && obj.velocity <= 127
  )
}

function clampNote(n: Record<string, number>): { pitch: number; time: number; duration: number; velocity: number } {
  return {
    pitch: Math.max(21, Math.min(108, Math.round(n.pitch))),
    time: Math.max(0, parseFloat((n.time ?? 0).toFixed(3))),
    duration: Math.max(0.25, Math.min(8, parseFloat((n.duration ?? 0.5).toFixed(3)))),
    velocity: Math.max(1, Math.min(127, Math.round(n.velocity ?? 100))),
  }
}

export async function getAISuggestion(
  apiKey: string,
  currentMelody: Array<{ pitch: number; time: number; duration: number; velocity: number }>,
  currentDrums: number[][],
  currentChords: Array<{ name: string; duration: number }>,
  bpm: number,
  key = 'C',
  mode = 'major'
): Promise<AISuggestion> {
  const scaleNotes = getScaleNotes(key, mode)
  const scaleNames = scaleNotes.slice(0, 14).map(n => {
    const oct = Math.floor(n / 12) - 1
    const name = NOTE_NAMES[n % 12]
    return `${name}${oct}(${n})`
  }).join(', ')

  // Calculate where new notes should start
  const existingDuration = currentMelody.length > 0
    ? Math.max(...currentMelody.map(n => n.time + n.duration))
    : 0
  const startBeat = Math.ceil(existingDuration / 4) * 4  // align to bar

  const systemPrompt = `You are an expert music composer. Generate music as JSON only — no markdown, no explanation, just raw JSON.

Rules:
- Key: ${key} ${mode} — scale MIDI pitches: ${scaleNames}
- BPM: ${bpm}
- Generate exactly 4 bars (16 beats total, beat unit = 1 quarter note)
- All note times are in beats, starting from beat ${startBeat}
- Use ONLY pitches from the scale. Prefer octave 4-5 range (MIDI 48-84).
- Durations: 0.25 (16th), 0.5 (8th), 1 (quarter), 2 (half), 4 (whole)
- Velocities: 60-110 range, vary for musical expression
- Melody: 8-16 notes across 4 bars, musical phrasing with rests between phrases
- Drums: 3 rows [kick, snare, hihat], each 16 steps (0 or 1). 
  Kick: beats 1,3 (steps 0,8). Snare: beats 2,4 (steps 4,12). Hihat: 8th note pattern.
- Chords: 4 chords, one per bar, diatonic to ${key} ${mode}

Respond ONLY with this exact JSON structure, no other text:
{
  "melody": { "notes": [{"pitch":60,"time":${startBeat},"duration":1,"velocity":90}] },
  "drums": { "pattern": [[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]] },
  "chords": [{"name":"${key}","duration":4},{"name":"${key}m","duration":4}]
}`

  const userPrompt = `Current context:
- Existing melody notes: ${currentMelody.length} (last at beat ${existingDuration.toFixed(1)})
- Chord progression so far: ${currentChords.map(c => c.name).join(' → ') || 'none'}
- Genre feel: ${bpm < 90 ? 'slow/chill' : bpm < 120 ? 'mid-tempo' : bpm < 140 ? 'upbeat' : 'fast/energetic'}

Generate the next 4 bars continuing this musical idea. Make it sound intentional and musical, not random. Use rhythmic variety — avoid all notes on every beat.`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://beatmaker.app',
      'X-Title': 'BeatMaker',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 1200,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content ?? ''

  // Extract JSON — strip markdown fences if present
  const cleaned = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in AI response')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Invalid JSON in AI response')
  }

  // Validate and sanitize melody notes
  const rawNotes = (parsed?.melody as Record<string, unknown>)?.notes
  const validNotes = Array.isArray(rawNotes)
    ? rawNotes
        .filter(n => n && typeof n === 'object')
        .map(n => clampNote(n as Record<string, number>))
        .filter(validateNote)
        .slice(0, 64)  // cap at 64 notes
    : []

  if (validNotes.length === 0) {
    // AI gave no usable notes — use musical fallback
    return generateFallbackSuggestion(bpm, key, mode, startBeat)
  }

  // Validate drum pattern
  const rawPattern = (parsed?.drums as Record<string, unknown>)?.pattern
  const drumPattern = Array.isArray(rawPattern) && rawPattern.length >= 3
    ? rawPattern.slice(0, 3).map(row =>
        Array.isArray(row)
          ? row.slice(0, 16).map(v => (v ? 1 : 0))
          : Array(16).fill(0)
      )
    : getDefaultDrumPattern(bpm)

  // Ensure each drum row is exactly 16 steps
  const paddedPattern = drumPattern.map(row => {
    if (row.length < 16) return [...row, ...Array(16 - row.length).fill(0)]
    return row.slice(0, 16)
  })

  // Validate chords
  const rawChords = parsed?.chords
  const chords = Array.isArray(rawChords)
    ? rawChords
        .filter(c => c && typeof c === 'object' && typeof (c as Record<string,unknown>).name === 'string')
        .map(c => ({ name: String((c as Record<string,unknown>).name), duration: Number((c as Record<string,unknown>).duration) || 4 }))
        .slice(0, 8)
    : []

  return {
    melody: { notes: validNotes },
    drums: { pattern: paddedPattern },
    chords,
  }
}

function getDefaultDrumPattern(bpm: number): number[][] {
  if (bpm >= 140) {
    // Trap: kick on 1, 2.5, snare on 3, rapid hihat
    return [
      [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
      [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
    ]
  }
  if (bpm <= 90) {
    // Lo-fi: sparse kick/snare, syncopated hihat
    return [
      [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1],
    ]
  }
  // Standard 4/4
  return [
    [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
  ]
}

export function generateFallbackSuggestion(
  bpm: number,
  key = 'C',
  mode = 'major',
  startBeat = 0
): AISuggestion {
  const scale = getScaleNotes(key, mode, 4, 5)  // focus on octave 4-5
  const bars = 4
  const beatsPerBar = 4

  // Build a musical phrase using the scale
  // Create a simple but musically sensible melody using scale degrees
  const phrase: Array<{ pitch: number; time: number; duration: number; velocity: number }> = []

  // Rhythmic templates (in 16th note units) that feel musical
  const rhythmPatterns = [
    [0, 2, 4, 6],           // quarter notes
    [0, 1, 3, 4, 6],        // syncopated
    [0, 2, 3, 5, 6, 7],     // 8th + 16th mix
    [0, 4, 6, 8, 12],       // sparse with long notes
  ]

  // Scale degree movements that sound musical
  const melodicIdeas = [
    [0, 2, 4, 2, 1, 0],     // up and back
    [4, 3, 2, 1, 0, 2],     // descending
    [0, 1, 3, 2, 4, 3],     // step motion
    [0, 4, 2, 5, 3, 1],     // arpeggiated
  ]

  const idea = melodicIdeas[Math.floor(Math.random() * melodicIdeas.length)]
  const rhythm = rhythmPatterns[Math.floor(Math.random() * rhythmPatterns.length)]

  for (let bar = 0; bar < bars; bar++) {
    const barStart = startBeat + bar * beatsPerBar
    // Use different scale degrees per bar for variety
    const barOffset = (bar * 2) % Math.max(1, scale.length - 5)

    for (let i = 0; i < rhythm.length; i++) {
      const rhythmPos = rhythm[i]
      const scaleDegree = (idea[i % idea.length] + barOffset) % scale.length
      const pitch = scale[scaleDegree]
      const time = barStart + rhythmPos * 0.25  // convert 16th notes to beats

      // Duration: usually 8th note, sometimes quarter
      const nextRhythmPos = rhythm[i + 1] ?? 16
      const maxDur = (nextRhythmPos - rhythmPos) * 0.25 * 0.9
      const duration = Math.max(0.25, Math.min(maxDur, i % 3 === 0 ? 1 : 0.5))

      // Velocity: accent on beat 1, softer on off-beats
      const beatInBar = rhythmPos / 4
      const velocity = beatInBar === 0 ? 105
        : beatInBar % 1 === 0 ? 90
        : 72

      phrase.push({ pitch, time: parseFloat(time.toFixed(3)), duration, velocity })
    }
  }

  // Generate chord progression (diatonic to key)
  const chordRoots: Record<string, string[][]> = {
    major: [['C'],['Dm'],['Em'],['F'],['G'],['Am'],['Bdim']],
    minor: [['Cm'],['Ddim'],['Eb'],['Fm'],['Gm'],['Ab'],['Bb']],
  }
  const progressions: Record<string, number[][]> = {
    major: [[0,3,4,5],[0,5,3,4],[0,3,5,4]],  // I-IV-V-VI variants
    minor: [[0,3,6,4],[0,6,3,4],[0,2,5,4]],
  }
  const modeKey = SCALES[mode] ? mode : 'major'
  const roots = chordRoots[modeKey in chordRoots ? modeKey : 'major']
  const progs = progressions[modeKey in progressions ? modeKey : 'major']
  const prog = progs[Math.floor(Math.random() * progs.length)]

  // Transpose chord roots to actual key
  const rootOffset = NOTE_NAMES.indexOf(key)
  const chords = prog.map(degree => {
    const baseChord = roots[degree % roots.length][0]
    // Rebuild chord name in correct key
    const isMinor = baseChord.includes('m') && !baseChord.includes('maj')
    const isDim = baseChord.includes('dim')
    const chordRoot = NOTE_NAMES[(NOTE_NAMES.indexOf(baseChord[0] === 'B' && baseChord[1] !== '#' ? 'B' : baseChord.slice(0, baseChord.includes('#') ? 2 : 1)) + rootOffset) % 12]
    const suffix = isDim ? 'dim' : isMinor ? 'm' : ''
    return { name: chordRoot + suffix, duration: 4 }
  })

  return {
    melody: { notes: phrase },
    drums: { pattern: getDefaultDrumPattern(bpm) },
    chords,
  }
}
