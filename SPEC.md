# AI Beat Maker - Project Specification

## Overview
AI-powered desktop beat maker that suggests melodic lines, chord progressions, and drum patterns based on music theory. Uses OpenRouter API for AI generation.

## Tech Stack
- **Framework**: Electron (desktop app)
- **Frontend**: React + TypeScript
- **Audio**: Web Audio API (custom synthesis + sample playback)
- **AI**: OpenRouter API (music theory generation)
- **Build**: electron-builder

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ window.ts   │  │ ipc-handler │  │ store.ts        │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                        IPC │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                      │
│  ┌──────────────────────────────────────────────────┐│
│  │                    App.tsx                        ││
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐  ││
│  │  │ PianoRoll  │ │ DrumGrid   │ │ ChordPanel   │  ││
│  │  └────────────┘ └────────────┘ └──────────────┘  ││
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐  ││
│  │  │ Transport  │ │ Mixer      │ │ Settings     │  ││
│  │  └────────────┘ └────────────┘ └──────────────┘  ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                           │
                     OpenRouter API
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   AI Service Layer                     │
│  ┌────────────────────────────────────────────────┐  │
│  │ openrouter.ts - API client                     │  │
│  │ musicTheory.ts - music theory prompting       │  │
│  │ suggestionEngine.ts - generates next bar      │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Melody Editor (Piano Roll)
- 128 MIDI notes, 16/32/64 bar patterns
- Click/drag to add notes
- Velocity editing per note
- Copy/paste sections

### 2. Drum Sequencer
- 16-step grid (4/4 time)
- Kits: Kick, Snare, Hi-Hat, Clap, Tom, Percussion
- Velocity per step
- Swing control

### 3. Chord Panel
- Chord selection per bar
- Support for 7th, 9th, 11th chords
- Inversion control
- Auto-progression suggestions

### 4. Transport
- BPM: 60-200
- Time signature: 4/4, 3/4, 6/8
- Play/Stop/Loop
- Metronome toggle

### 5. Audio Recording
- Microphone input via Web Audio API
- Record melody ideas
- Convert to MIDI notes (basic pitch detection)

### 6. AI Suggestions
- "Generate Next Bar" button
- Analyzes current song state
- Suggests melody, chords, drums
- Music theory based (key, scale, progressions)
- User can accept/modify/reject

### 7. Mixer
- Per-track volume/pan
- Master volume
- Mute/Solo per track

### 8. Project Management
- JSON-based project files (.beatmaker)
- Save/Load projects
- Export as WAV

## AI Integration

### OpenRouter API
- **Model**: deepseek/deepseek-chat-v3:free (configurable)
- **Endpoint**: https://openrouter.ai/api/v1/chat/completions
- **API Key**: User provides via settings

### Music Theory System Prompt
- Key detection from melody
- Scale selection (major, minor, modes)
- Chord-scale relationships
- Voice leading rules
- Common progressions (I-IV-V, ii-V-I, etc.)
- Genre-appropriate patterns

### Suggestion Flow
1. User clicks "Suggest Next Bar"
2. Send current song state (melody, chords, drums, BPM)
3. AI returns JSON: { melody: [...], drums: [...], chords: [...] }
4. User accepts → added to project
5. User modifies → edit before adding
6. User rejects → discard

## File Structure

```
beatmaker/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── main.ts           # Electron entry point
│   │   ├── preload.ts        # Secure IPC bridge
│   │   └── store.ts          # electron-store for settings
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx          # React entry
│   │   ├── App.tsx           # Main component
│   │   ├── components/
│   │   │   ├── PianoRoll.tsx
│   │   │   ├── DrumSequencer.tsx
│   │   │   ├── ChordPanel.tsx
│   │   │   ├── Transport.tsx
│   │   │   ├── Mixer.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── AudioRecorder.tsx
│   │   ├── hooks/
│   │   │   └── useAudio.ts
│   │   └── styles/
│   │       └── main.css
│   ├── audio/
│   │   ├── engine.ts         # Web Audio context
│   │   ├── synth.ts          # Synthesizer
│   │   ├── drums.ts          # Drum sample playback
│   │   └── scheduler.ts      # Note scheduling
│   ├── ai/
│   │   ├── openrouter.ts     # API client
│   │   ├── musicTheory.ts    # System prompt
│   │   └── suggestionEngine.ts
│   └── shared/
│       └── types.ts          # TypeScript interfaces
├── resources/
│   ├── samples/              # Drum samples
│   │   ├── kick.wav
│   │   ├── snare.wav
│   │   ├── hihat.wav
│   │   └── ...
│   └── icon.png
└── SPEC.md
```

## Project File Format (.beatmaker)

```json
{
  "version": "1.0",
  "name": "My Beat",
  "bpm": 120,
  "timeSignature": "4/4",
  "tracks": {
    "melody": {
      "notes": [
        { "pitch": 60, "time": 0, "duration": 0.5, "velocity": 100 }
      ]
    },
    "drums": {
      "pattern": [1,0,0,0, 0,0,1,0, ...]
    },
    "chords": {
      "progression": ["C", "Am", "F", "G"]
    }
  }
}
```

## Implementation Phases

### Phase 1: Basic Setup
- Initialize Electron + React project
- Set up build configuration

### Phase 2: Audio Engine
- Web Audio API setup
- Drum sample loading
- Synth implementation
- Scheduling system

### Phase 3: UI Components
- Piano Roll
- Drum Sequencer
- Chord Panel
- Transport controls

### Phase 4: AI Integration
- OpenRouter client
- Music theory prompts
- Suggestion engine

### Phase 5: Polish
- Save/Load functionality
- Mixer
- Settings panel
- Export

## Dependencies

### Runtime
- electron: ^28.x
- react: ^18.x
- react-dom: ^18.x
- electron-store: ^8.x

### Dev
- typescript: ^5.x
- electron-builder: ^24.x
- vite: ^5.x
- @vitejs/plugin-react: ^4.x