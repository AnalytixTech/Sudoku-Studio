// Canvas confetti particle animation for puzzle victory

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  vRot: number
  alpha: number
}

const DEFAULT_COLORS = ['#4da3ff', '#35b57f', '#ffd24d', '#ff5470', '#b87cff', '#00f5d4']

/** @param palette colours from the player's equipped win effect. */
export function triggerConfetti(palette: string[] = DEFAULT_COLORS) {
  const COLORS = palette.length > 0 ? palette : DEFAULT_COLORS
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let width = (canvas.width = window.innerWidth)
  let height = (canvas.height = window.innerHeight)

  const handleResize = () => {
    width = canvas.width = window.innerWidth
    height = canvas.height = window.innerHeight
  }
  window.addEventListener('resize', handleResize)

  const particles: Particle[] = []
  const count = 110

  for (let i = 0; i < count; i++) {
    particles.push({
      x: width / 2 + (Math.random() - 0.5) * 150,
      y: height / 2 + (Math.random() - 0.5) * 150,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -14 - 4,
      size: Math.random() * 8 + 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.2,
      alpha: 1,
    })
  }

  const animate = () => {
    ctx.clearRect(0, 0, width, height)
    let activeCount = 0

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.35 // gravity
      p.vx *= 0.98
      p.rotation += p.vRot
      p.alpha -= 0.008

      if (p.alpha > 0) {
        activeCount++
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
    }

    if (activeCount > 0) {
      requestAnimationFrame(animate)
    } else {
      window.removeEventListener('resize', handleResize)
      canvas.remove()
    }
  }

  requestAnimationFrame(animate)
}
