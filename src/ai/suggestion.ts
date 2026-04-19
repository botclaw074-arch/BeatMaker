export interface AISuggestion {
  melody: {
    notes: Array<{ pitch: number; time: number; duration: number; velocity: number }>
  }
  drums: {
    pattern: number[][]
  }
  chords: Array<{ name: string; duration: number }>
}

export async function getAISuggestion(
  apiKey: string,
  currentMelody: any[],
  currentDrums: any,
  currentChords: any[],
  bpm: number,
  key: string = 'C',
  mode: string = 'major'
): Promise<AISuggestion> {
  const systemPrompt = `You are an expert music composer with deep knowledge of music theory. You specialize in generating melodies, chord progressions, and drum patterns that work together harmoniously.

Guidelines:
- Always respond with valid JSON only, no other text
- Use music theory principles: harmonic progression, voice leading, rhythmic coherence
- Match the vibe and energy of the input
- Generate creative but musically sound suggestions
- Key: ${key} ${mode}

For melody:
- Use notes from the ${mode === 'major' ? 'C major scale: C D E F G A B' : 'C minor scale: C D Eb F G Ab Bb'}
- Follow rhythmic patterns that complement the drums
- Use appropriate intervals for the genre

For drums:
- Create driving, genre-appropriate patterns
- Include kick on 1 and 3, snare on 2 and 4 for basic rock/pop
- Add fills at bar endings

For chords:
- Use diatonic chords from ${key} ${mode}
- Common progressions: I-IV-V-I, I-vi-IV-V, ii-V-I
- Add 7th chords for richness`

  const userPrompt = `Generate the next 4 bars (16 beats at ${bpm} BPM) based on this context:

Current melody (MIDI notes): ${JSON.stringify(currentMelody)}
Current chord progression: ${JSON.stringify(currentChords)}
Current drum pattern: ${JSON.stringify(currentDrums)}

Provide a JSON response with:
{
  "melody": { "notes": [{ "pitch": number, "time": number (beats), "duration": number (beats), "velocity": 100 }] },
  "drums": { "pattern": [[kick, snare, hihat, ...], ...] per drum sound },
  "chords": [{ "name": "C", "duration": 4 }]
}`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-OpenRouter-Title': 'BeatMaker'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response content')
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No valid JSON in response')
    }

    return JSON.parse(jsonMatch[0])
  } catch (error) {
    console.error('AI Suggestion Error:', error)
    throw error
  }
}

export function generateFallbackSuggestion(_bpm: number): AISuggestion {
  const beatsPerBar = 4
  const bars = 4
  
  const melodyNotes = []
  const scale = [60, 62, 64, 65, 67, 69, 71, 72]
  
  for (let bar = 0; bar < bars; bar++) {
    const notesInBar = Math.floor(Math.random() * 4) + 2
    for (let i = 0; i < notesInBar; i++) {
      const time = bar * beatsPerBar + (i * beatsPerBar / notesInBar)
      const pitch = scale[Math.floor(Math.random() * scale.length)]
      melodyNotes.push({
        pitch,
        time: parseFloat(time.toFixed(2)),
        duration: parseFloat((beatsPerBar / notesInBar * 0.8).toFixed(2)),
        velocity: Math.floor(Math.random() * 30) + 90
      })
    }
  }

  const kickPattern = []
  const snarePattern = []
  const hihatPattern = []
  
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      kickPattern.push(beat === 0 || beat === 2 ? 1 : 0)
      snarePattern.push(beat === 1 || beat === 3 ? 1 : 0)
      hihatPattern.push(1)
    }
  }

  const chords = [
    { name: 'C', duration: 4 },
    { name: 'F', duration: 4 },
    { name: 'G', duration: 4 },
    { name: 'C', duration: 4 }
  ]

  return {
    melody: { notes: melodyNotes },
    drums: {
      pattern: [kickPattern, snarePattern, hihatPattern]
    },
    chords
  }
}