import React, { useRef, useState, useCallback } from 'react'
import type { Note } from '../../shared/types'
import { getNoteName, isBlackKey } from '../../stores/projectStore'

interface PatternGridProps {
  notes: Note[]
  totalRows: number
  totalSteps: number
  currentStep: number
  trackColor: string
  startPitch: number
  onNoteAdd: (pitch: number, time: number, velocity: number) => void
  onNoteRemove: (pitch: number, time: number) => void
}

export const PatternGrid: React.FC<PatternGridProps> = ({
  notes,
  totalRows,
  totalSteps,
  currentStep,
  trackColor,
  startPitch,
  onNoteAdd,
  onNoteRemove,
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragPitch, setDragPitch] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, pitch: number, time: number) => {
    e.stopPropagation()
    setIsDragging(true)
    setDragPitch(pitch)

    const existingNote = notes.find(n => n.pitch === pitch && Math.floor(n.time) === time)
    if (existingNote) {
      onNoteRemove(pitch, time)
    } else {
      onNoteAdd(pitch, time, 100)
    }
  }, [notes, onNoteAdd, onNoteRemove])

  const handleMouseEnter = useCallback((pitch: number, time: number) => {
    if (isDragging && dragPitch !== null) {
      const existingNote = notes.find(n => n.pitch === pitch && Math.floor(n.time) === time)
      if (!existingNote) {
        onNoteAdd(pitch, time, 100)
      }
    }
  }, [isDragging, dragPitch, notes, onNoteAdd])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragPitch(null)
  }, [])

  return (
    <div 
      className="pattern-grid"
      ref={gridRef}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="grid-content">
        {Array(totalRows).fill(0).map((_, row) => {
          const pitch = startPitch + row
          const isBlack = isBlackKey(pitch)
          
          return (
            <div key={row} className={`grid-row ${isBlack ? 'black-row' : 'white-row'}`}>
              <div className="row-label">
                {getNoteName(pitch)}
              </div>
              <div className="row-cells">
                {Array(totalSteps).fill(0).map((_, step) => {
                  const noteAtStep = notes.find(n => n.pitch === pitch && Math.floor(n.time) === step)
                  const isPlaying = step === currentStep

                  return (
                    <div
                      key={step}
                      className={`grid-cell ${isBlack ? 'black-cell' : 'white-cell'} ${isPlaying ? 'playing' : ''} ${noteAtStep ? 'has-note' : ''}`}
                      onMouseDown={(e) => handleMouseDown(e, pitch, step)}
                      onMouseEnter={() => handleMouseEnter(pitch, step)}
                      style={noteAtStep ? { 
                        backgroundColor: trackColor,
                        opacity: noteAtStep.velocity / 127 
                      } : undefined}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PatternGrid