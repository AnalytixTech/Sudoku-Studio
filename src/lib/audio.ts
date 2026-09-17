// Web Audio API synthesizer for sound effects (zero external dependencies)

class SoundManager {
  private ctx: AudioContext | null = null
  private muted: boolean = false

  constructor() {
    this.muted = localStorage.getItem('sudoku_sound_muted') === 'true'
  }

  public isMuted(): boolean {
    return this.muted
  }

  public toggleMute(): boolean {
    this.muted = !this.muted
    localStorage.setItem('sudoku_sound_muted', String(this.muted))
    return this.muted
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  public playSelect() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.04)

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.04)
  }

  public playPlaceDigit() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(523.25, this.ctx.currentTime) // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, this.ctx.currentTime + 0.08) // E5

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.08)
  }

  public playNoteToggle() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(783.99, this.ctx.currentTime) // G5
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.04)
  }

  public playErase() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(329.63, this.ctx.currentTime) // E4
    osc.frequency.exponentialRampToValueAtTime(220, this.ctx.currentTime + 0.06) // A3

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.06)
  }

  public playError() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, this.ctx.currentTime)
    osc.frequency.setValueAtTime(120, this.ctx.currentTime + 0.08)

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.16)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.16)
  }

  public playHint() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.05)

      gain.gain.setValueAtTime(0.1, this.ctx!.currentTime + idx * 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.05 + 0.12)

      osc.connect(gain)
      gain.connect(this.ctx!.destination)

      osc.start(this.ctx!.currentTime + idx * 0.05)
      osc.stop(this.ctx!.currentTime + idx * 0.05 + 0.12)
    })
  }

  public playWinFanfare() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const arpeggio = [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5, E5, G5, C6, E6
    arpeggio.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.08)

      gain.gain.setValueAtTime(0.18, this.ctx!.currentTime + idx * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.08 + 0.25)

      osc.connect(gain)
      gain.connect(this.ctx!.destination)

      osc.start(this.ctx!.currentTime + idx * 0.08)
      osc.stop(this.ctx!.currentTime + idx * 0.08 + 0.25)
    })
    this.vibrate([50, 100, 50, 100, 150])
  }

  public playLineClear() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const notes = [659.25, 830.61, 987.77] // E5, G#5, B5 bright major triad
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.06)

      gain.gain.setValueAtTime(0.12, this.ctx!.currentTime + idx * 0.06)
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.06 + 0.18)

      osc.connect(gain)
      gain.connect(this.ctx!.destination)

      osc.start(this.ctx!.currentTime + idx * 0.06)
      osc.stop(this.ctx!.currentTime + idx * 0.06 + 0.18)
    })
    this.vibrate([15, 30, 15])
  }

  public playCountdownTick() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, this.ctx.currentTime)

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.08)
  }

  public playCountdownGo() {
    if (this.muted) return
    this.initCtx()
    if (!this.ctx) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.25)

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + 0.25)
    this.vibrate([30, 50, 30])
  }

  public vibrate(pattern: number | number[]) {
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch {
        // Safe fallback if unsupported
      }
    }
  }
}

export const sound = new SoundManager()

