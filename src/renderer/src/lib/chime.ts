/**
 * The over-limit cue. Synthesised rather than shipped as a file: a few sine
 * partials weigh nothing, need no asset in the CSP, and can be tuned by ear
 * here instead of in an editor.
 *
 * It has to carry across a room without making anyone jump, so: a rising
 * perfect fourth (G5 → C6) at low gain, each note a bell — instant-ish attack,
 * long exponential decay — under a lowpass that takes the glassy edge off.
 * No square waves, no repeats, nothing above 1.1 kHz.
 */

const NOTES = [
  { hz: 783.99, at: 0, gain: 0.16 }, // G5
  { hz: 1046.5, at: 0.17, gain: 0.13 } // C6
]

const ATTACK = 0.012
const RELEASE = 1.45

let context: AudioContext | null = null

function ensureContext(): AudioContext | null {
  try {
    context ??= new AudioContext()
    // Chromium suspends the context until a gesture; by the time a limit is
    // reached the user has pressed play, so this resolves immediately.
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

export function playLimitChime(): void {
  // Someone who asked the system for less motion did not ask for less sound,
  // so this is gated on the app's own setting only — see SettingsDialog.
  const ctx = ensureContext()
  if (!ctx) return

  const now = ctx.currentTime
  const softener = ctx.createBiquadFilter()
  softener.type = 'lowpass'
  softener.frequency.value = 2200
  softener.Q.value = 0.5
  softener.connect(ctx.destination)

  for (const note of NOTES) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = note.hz

    const envelope = ctx.createGain()
    const start = now + note.at
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(note.gain, start + ATTACK)
    // Exponential, not linear: a linear tail sounds like the sound was cut off.
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + RELEASE)

    osc.connect(envelope)
    envelope.connect(softener)
    osc.start(start)
    osc.stop(start + RELEASE + 0.05)
    // Nodes are one-shot; let them go as soon as they have rung out.
    osc.onended = () => {
      osc.disconnect()
      envelope.disconnect()
    }
  }
}
