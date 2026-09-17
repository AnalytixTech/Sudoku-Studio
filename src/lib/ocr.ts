import { createWorker, PSM, type Worker as TessWorker } from 'tesseract.js'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface GridLines {
  rows: number[] // normalized 0..1 boundaries (10 values)
  cols: number[]
}

export interface Extracted {
  grid: number[][]
  confidence: number[][]
}

const ANALYZE_W = 400

// --------------------------------------------------------------------------
// Image file loading
// --------------------------------------------------------------------------

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read that image bitmap.'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Could not read that image file.'))
    reader.readAsDataURL(file)
  })
}

function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the rotated image.'))
    img.src = url
  })
}

export async function rotateImage(image: HTMLImageElement, deg: number): Promise<HTMLImageElement> {
  if (Math.abs(deg) < 0.01) return image
  const rad = (deg * Math.PI) / 180
  const w = image.naturalWidth
  const h = image.naturalHeight
  const rw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))
  const rh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rw))
  canvas.height = Math.max(1, Math.round(rh))
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(image, -w / 2, -h / 2)
  return loadImageUrl(canvas.toDataURL('image/jpeg', 0.92))
}

// --------------------------------------------------------------------------
// Grayscale analysis + Otsu binarization
// --------------------------------------------------------------------------

function otsuThreshold(hist: number[], total: number): number {
  let sum1 = 0
  for (let i = 0; i < 256; i++) sum1 += i * hist[i]
  let sumB = 0
  let wB = 0
  let max = 0
  let threshold = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum1 - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > max) {
      max = between
      threshold = i
    }
  }
  return threshold
}

interface Analysis {
  bin: Uint8Array
  gray: Uint8ClampedArray
  w: number
  h: number
}

function analyzeRegion(image: HTMLImageElement, rect: Rect): Analysis {
  const w = Math.max(128, Math.round(ANALYZE_W))
  const h = Math.max(128, Math.round((ANALYZE_W * rect.h) / rect.w))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const hist = new Array(256).fill(0)
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) {
    const g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
    gray[i] = g
    hist[g]++
  }
  const th = otsuThreshold(hist, w * h)
  const bin = new Uint8Array(w * h)
  let dark = 0
  for (let i = 0; i < w * h; i++) {
    if (gray[i] < th) {
      bin[i] = 1
      dark++
    }
  }
  if (dark > (w * h) / 2) {
    for (let i = 0; i < w * h; i++) bin[i] = bin[i] ? 0 : 1
  }
  return { bin, gray, w, h }
}

// --------------------------------------------------------------------------
// Connected components
// --------------------------------------------------------------------------

interface Conn {
  x0: number
  y0: number
  x1: number
  y1: number
  size: number
}

function largestComponent(bin: Uint8Array, w: number, h: number): Conn | null {
  const visited = new Uint8Array(w * h)
  let best: Conn | null = null
  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || visited[start]) continue
    const stack = [start]
    visited[start] = 1
    let size = 0
    let x0 = w
    let y0 = h
    let x1 = 0
    let y1 = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p / w) | 0
      size++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (x > 0) push(x - 1, y)
      if (x < w - 1) push(x + 1, y)
      if (y > 0) push(x, y - 1)
      if (y < h - 1) push(x, y + 1)
    }
    function push(x: number, y: number) {
      const idx = y * w + x
      if (bin[idx] && !visited[idx]) {
        visited[idx] = 1
        stack.push(idx)
      }
    }
    if (!best || size > best.size) best = { x0, y0, x1, y1, size }
  }
  return best
}

// --------------------------------------------------------------------------
// Auto-crop bounds detection
// --------------------------------------------------------------------------

export function detectBounds(image: HTMLImageElement): Rect {
  const scale = Math.min(1, 460 / Math.max(image.naturalWidth, image.naturalHeight))
  const w = Math.max(2, Math.round(image.naturalWidth * scale))
  const h = Math.max(2, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const hist = new Array(256).fill(0)
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) {
    const g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
    gray[i] = g
    hist[g]++
  }
  const th = otsuThreshold(hist, w * h)
  const bin = new Uint8Array(w * h)
  let dark = 0
  for (let i = 0; i < w * h; i++) {
    if (gray[i] < th) {
      bin[i] = 1
      dark++
    }
  }
  if (dark > (w * h) / 2) for (let i = 0; i < w * h; i++) bin[i] = bin[i] ? 0 : 1

  const comp = largestComponent(bin, w, h)
  if (!comp || comp.size < 0.02 * w * h || (comp.x1 - comp.x0 >= w * 0.90 && comp.y1 - comp.y0 >= h * 0.90)) {
    return { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight }
  }

  const inset = 0.01
  const x0 = Math.max(0, (comp.x0 - (comp.x1 - comp.x0) * inset) / scale)
  const y0 = Math.max(0, (comp.y0 - (comp.y1 - comp.y0) * inset) / scale)
  const x1 = Math.min(image.naturalWidth, (comp.x1 + (comp.x1 - comp.x0) * inset) / scale)
  const y1 = Math.min(image.naturalHeight, (comp.y1 + (comp.y1 - comp.y0) * inset) / scale)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// --------------------------------------------------------------------------
// Grid line detection
// --------------------------------------------------------------------------

function smoothProfile(profile: number[], dim: number): number[] {
  const k = Math.max(2, Math.round(dim / 200))
  const out = new Array(dim).fill(0)
  for (let i = 0; i < dim; i++) {
    let s = 0
    let n = 0
    for (let d = -k; d <= k; d++) {
      const j = i + d
      if (j >= 0 && j < dim) {
        s += profile[j]
        n++
      }
    }
    out[i] = s / n
  }
  return out
}

function findLinePeaks(profile: number[], dim: number, perp: number): number[] | null {
  const max = Math.max(...profile)
  if (max < perp * 10) return null

  const smoothed = smoothProfile(profile, dim)
  const minSep = Math.round(dim * 0.03)
  const peaks: { pos: number; val: number }[] = []
  const scratch = smoothed.slice()

  while (peaks.length < 25) {
    let bestPos = -1
    let bestVal = -1
    for (let i = 0; i < dim; i++) {
      if (scratch[i] > bestVal) {
        bestVal = scratch[i]
        bestPos = i
      }
    }
    if (bestVal < max * 0.12) break
    peaks.push({ pos: bestPos, val: bestVal })
    const lo = Math.max(0, bestPos - minSep)
    const hi = Math.min(dim, bestPos + minSep + 1)
    for (let i = lo; i < hi; i++) scratch[i] = 0
  }

  if (peaks.length < 10) return null

  const sortedPos = peaks.map((p) => p.pos).sort((a, b) => a - b)

  if (sortedPos.length === 10) {
    const gaps: number[] = []
    for (let i = 1; i < 10; i++) gaps.push(sortedPos[i] - sortedPos[i - 1])
    const med = gaps.slice().sort((a, b) => a - b)[4]
    if (med <= 0) return null
    const dev = gaps.reduce((acc, g) => acc + Math.abs(g - med), 0) / gaps.length
    if (dev / med > 0.25) return null
    return sortedPos
  }

  // Fast O(N^2) match for 10 uniformly spaced line peaks
  let bestSub: number[] | null = null
  let bestDev = Infinity

  for (let firstIdx = 0; firstIdx <= sortedPos.length - 10; firstIdx++) {
    for (let lastIdx = firstIdx + 9; lastIdx < sortedPos.length; lastIdx++) {
      const p0 = sortedPos[firstIdx]
      const p9 = sortedPos[lastIdx]
      const step = (p9 - p0) / 9

      if (step < dim * 0.04) continue

      const chosen: number[] = [p0]
      let valid = true

      for (let k = 1; k < 9; k++) {
        const ideal = p0 + k * step
        let closest = -1
        let minDiff = Infinity
        for (let j = firstIdx + 1; j < lastIdx; j++) {
          const diff = Math.abs(sortedPos[j] - ideal)
          if (diff < minDiff) {
            minDiff = diff
            closest = sortedPos[j]
          }
        }
        if (closest === -1 || minDiff > step * 0.35) {
          valid = false
          break
        }
        chosen.push(closest)
      }
      chosen.push(p9)

      if (valid) {
        const gaps: number[] = []
        for (let i = 1; i < 10; i++) gaps.push(chosen[i] - chosen[i - 1])
        const med = gaps.slice().sort((a, b) => a - b)[4]
        const dev = gaps.reduce((acc, g) => acc + Math.abs(g - med), 0) / gaps.length
        const score = dev / med
        if (score < bestDev) {
          bestDev = score
          bestSub = chosen
        }
      }
    }
  }

  if (!bestSub || bestDev > 0.25) return null
  return bestSub
}

function detectAxisLines(image: HTMLImageElement, rect: Rect, axis: 'cols' | 'rows'): number[] | null {
  const { bin, gray, w, h } = analyzeRegion(image, rect)
  const dim = axis === 'cols' ? w : h
  const perp = axis === 'cols' ? h : w

  const profile = new Array(dim).fill(0)
  for (let i = 0; i < dim; i++) {
    let ink = 0
    for (let j = 0; j < perp; j++) {
      const g = axis === 'cols' ? gray[j * dim + i] : gray[i * dim + j]
      ink += 255 - g
    }
    profile[i] = ink
  }

  let peaks = findLinePeaks(profile, dim, perp)
  if (!peaks) {
    const binProfile = new Array(dim).fill(0)
    for (let i = 0; i < dim; i++) {
      let ink = 0
      for (let j = 0; j < perp; j++) ink += axis === 'cols' ? bin[j * dim + i] : bin[i * dim + j]
      binProfile[i] = ink
    }
    peaks = findLinePeaks(binProfile, dim, perp)
  }
  if (!peaks) return null

  return peaks.map((p) => p / dim)
}

export function detectGridLines(image: HTMLImageElement, rect: Rect): GridLines | null {
  const cols = detectAxisLines(image, rect, 'cols')
  if (!cols) return null
  const rows = detectAxisLines(image, rect, 'rows')
  if (!rows) return null
  return { rows, cols }
}

// --------------------------------------------------------------------------
// Cell extraction + High-Contrast Binarization for OCR
// --------------------------------------------------------------------------

export interface Extracted {
  grid: number[][]
  confidence: number[][]
  conflicts: boolean[][]
  previews: string[][]
}

function uniformBoundaries(): number[] {
  return Array.from({ length: 10 }, (_, i) => i / 9)
}

// --------------------------------------------------------------------------
// Connected Component Border Filtering & Digit Centering
// --------------------------------------------------------------------------

interface Blob {
  x0: number
  y0: number
  x1: number
  y1: number
  pixels: number[]
  touchesEdge: boolean
}

function findCellBlobs(bin: Uint8Array, w: number, h: number, margin: number): Blob[] {
  const visited = new Uint8Array(w * h)
  const blobs: Blob[] = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (!bin[idx] || visited[idx]) continue

      const stack = [idx]
      visited[idx] = 1
      let x0 = x, x1 = x, y0 = y, y1 = y
      let touchesEdge = false
      const pixels: number[] = []

      while (stack.length > 0) {
        const p = stack.pop()!
        pixels.push(p)
        const px = p % w
        const py = (p / w) | 0

        if (px <= margin || px >= w - 1 - margin || py <= margin || py >= h - 1 - margin) {
          touchesEdge = true
        }

        if (px < x0) x0 = px
        if (px > x1) x1 = px
        if (py < y0) y0 = py
        if (py > y1) y1 = py

        // 8-way connectivity
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = px + dx
            const ny = py + dy
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx
              if (bin[nidx] && !visited[nidx]) {
                visited[nidx] = 1
                stack.push(nidx)
              }
            }
          }
        }
      }

      blobs.push({ x0, y0, x1, y1, pixels, touchesEdge })
    }
  }

  return blobs
}

// Count enclosed white holes (Euler hole count approximation)
function countHoles(bin: Uint8Array, w: number, bbox: { x0: number; y0: number; x1: number; y1: number }): number {
  const bw = bbox.x1 - bbox.x0 + 3
  const bh = bbox.y1 - bbox.y0 + 3
  const grid = new Uint8Array(bw * bh) // 0 = white, 1 = black ink

  for (let y = bbox.y0; y <= bbox.y1; y++) {
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      if (bin[y * w + x]) {
        grid[(y - bbox.y0 + 1) * bw + (x - bbox.x0 + 1)] = 1
      }
    }
  }

  // Flood fill background white pixels starting from (0,0)
  const bgVisited = new Uint8Array(bw * bh)
  const queue = [0]
  bgVisited[0] = 1

  while (queue.length > 0) {
    const curr = queue.pop()!
    const cx = curr % bw
    const cy = (curr / bw) | 0

    const neighbors = [
      [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]
    ]

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < bw && ny >= 0 && ny < bh) {
        const nidx = ny * bw + nx
        if (!grid[nidx] && !bgVisited[nidx]) {
          bgVisited[nidx] = 1
          queue.push(nidx)
        }
      }
    }
  }

  // Count unvisited white regions inside with minimum area threshold (>= 6 pixels)
  let holes = 0
  const holeVisited = new Uint8Array(bw * bh)

  for (let i = 0; i < bw * bh; i++) {
    if (!grid[i] && !bgVisited[i] && !holeVisited[i]) {
      const hstack = [i]
      holeVisited[i] = 1
      let holeArea = 0
      while (hstack.length > 0) {
        const hp = hstack.pop()!
        holeArea++
        const hx = hp % bw
        const hy = (hp / bw) | 0
        const hnbrs = [[hx - 1, hy], [hx + 1, hy], [hx, hy - 1], [hx, hy + 1]]
        for (const [nx, ny] of hnbrs) {
          if (nx >= 0 && nx < bw && ny >= 0 && ny < bh) {
            const nidx = ny * bw + nx
            if (!grid[nidx] && !bgVisited[nidx] && !holeVisited[nidx]) {
              holeVisited[nidx] = 1
              hstack.push(nidx)
            }
          }
        }
      }

      if (holeArea >= 6) {
        holes++
      }
    }
  }

  return holes
}

function checkDigitStructure2vs4(
  bin: Uint8Array,
  w: number,
  bbox: { x0: number; y0: number; x1: number; y1: number }
): '2' | '4' | 'unknown' {
  const dbw = bbox.x1 - bbox.x0 + 1
  const dbh = bbox.y1 - bbox.y0 + 1
  if (dbh < 10 || dbw < 5) return 'unknown'

  const yMidStart = Math.floor(bbox.y0 + dbh * 0.35)
  const yMidEnd = Math.floor(bbox.y0 + dbh * 0.68)
  const yBotStart = Math.floor(bbox.y0 + dbh * 0.72)

  let maxMidRowWidth = 0
  for (let y = yMidStart; y <= yMidEnd; y++) {
    let rowInk = 0
    let minX = w, maxX = 0
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      if (bin[y * w + x]) {
        rowInk++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    if (rowInk >= 2) {
      const rowSpan = maxX - minX + 1
      if (rowSpan > maxMidRowWidth) maxMidRowWidth = rowSpan
    }
  }

  let maxBotRowWidth = 0
  for (let y = yBotStart; y <= bbox.y1; y++) {
    let rowInk = 0
    let minX = w, maxX = 0
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      if (bin[y * w + x]) {
        rowInk++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    if (rowInk >= 2) {
      const rowSpan = maxX - minX + 1
      if (rowSpan > maxBotRowWidth) maxBotRowWidth = rowSpan
    }
  }

  const isBottomWideBase = maxBotRowWidth >= dbw * 0.60
  const isMiddleWideCrossbar = maxMidRowWidth >= dbw * 0.50

  if (isMiddleWideCrossbar && !isBottomWideBase) {
    return '4'
  }
  if (isBottomWideBase && maxMidRowWidth < dbw * 0.45) {
    return '2'
  }
  return 'unknown'
}

function makeCellCanvas(
  image: HTMLImageElement,
  rect: Rect,
  x0n: number,
  x1n: number,
  y0n: number,
  y1n: number
): { canvas: HTMLCanvasElement; hasInk: boolean; previewUrl: string; holes: number; aspect: number; struct: '2' | '4' | 'unknown' } {
  const cw = (x1n - x0n) * rect.w
  const ch = (y1n - y0n) * rect.h

  // Inset 5% to exclude major line overlap while giving full digit room
  const insetX = cw * 0.05
  const insetY = ch * 0.05
  const sx0 = Math.max(0, rect.x + x0n * rect.w + insetX)
  const sy0 = Math.max(0, rect.y + y0n * rect.h + insetY)
  const sx1 = Math.min(image.naturalWidth, rect.x + x1n * rect.w - insetX)
  const sy1 = Math.min(image.naturalHeight, rect.y + y1n * rect.h - insetY)
  const sw = Math.max(1, sx1 - sx0)
  const sh = Math.max(1, sy1 - sy0)

  const rawW = 100
  const rawH = 100
  const rawCanvas = document.createElement('canvas')
  rawCanvas.width = rawW
  rawCanvas.height = rawH
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true })!
  rawCtx.drawImage(image, sx0, sy0, sw, sh, 0, 0, rawW, rawH)

  const imgData = rawCtx.getImageData(0, 0, rawW, rawH)
  const data = imgData.data

  // Convert to Grayscale & Calculate Integral Image for Local Adaptive Thresholding
  const gray = new Uint8Array(rawW * rawH)
  const integral = new Int32Array((rawW + 1) * (rawH + 1))

  for (let y = 0; y < rawH; y++) {
    let rowSum = 0
    for (let x = 0; x < rawW; x++) {
      const idx = (y * rawW + x) * 4
      const g = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2])
      gray[y * rawW + x] = g
      rowSum += g
      integral[(y + 1) * (rawW + 1) + (x + 1)] = integral[y * (rawW + 1) + (x + 1)] + rowSum
    }
  }

  // Adaptive thresholding window
  const windowRadius = 7
  // Test Polarity A: Dark ink on light background
  const binDark = new Uint8Array(rawW * rawH)
  // Test Polarity B: Light/White ink on dark background/tiles
  const binLight = new Uint8Array(rawW * rawH)

  for (let y = 0; y < rawH; y++) {
    const y0 = Math.max(0, y - windowRadius)
    const y1 = Math.min(rawH - 1, y + windowRadius)
    for (let x = 0; x < rawW; x++) {
      const x0 = Math.max(0, x - windowRadius)
      const x1 = Math.min(rawW - 1, x + windowRadius)

      const count = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum =
        integral[(y1 + 1) * (rawW + 1) + (x1 + 1)] -
        integral[y0 * (rawW + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (rawW + 1) + x0] +
        integral[y0 * (rawW + 1) + x0]

      const mean = sum / count
      const pixel = gray[y * rawW + x]

      // Dark ink check (darker than local background)
      if (pixel < Math.min(mean * 0.90, 185) && (mean - pixel) > 10) {
        binDark[y * rawW + x] = 1
      }
      // Light ink check (lighter than local background, e.g. white text on colored/dark tile)
      if (pixel > Math.max(mean * 1.10, 70) && (pixel - mean) > 10) {
        binLight[y * rawW + x] = 1
      }
    }
  }

  const filterBlobs = (bList: Blob[]) =>
    bList.filter((b) => {
      if (b.touchesEdge) return false
      const pixelCount = b.pixels.length
      if (pixelCount < 14) return false
      const bw = b.x1 - b.x0 + 1
      const bh = b.y1 - b.y0 + 1
      const cx = (b.x0 + b.x1) / 2
      const cy = (b.y0 + b.y1) / 2
      if (cx < rawW * 0.05 || cx > rawW * 0.95 || cy < rawH * 0.05 || cy > rawH * 0.95) return false
      if (bw > rawW * 0.92 || bh > rawH * 0.92) return false
      return true
    })

  const blobsDark = filterBlobs(findCellBlobs(binDark, rawW, rawH, 3))
  const blobsLight = filterBlobs(findCellBlobs(binLight, rawW, rawH, 3))

  const darkCount = blobsDark.reduce((acc, b) => acc + b.pixels.length, 0)
  const lightCount = blobsLight.reduce((acc, b) => acc + b.pixels.length, 0)

  // Choose superior polarity mask
  let digitBlobs = blobsDark

  if (lightCount > darkCount && lightCount >= 14) {
    digitBlobs = blobsLight
  } else if (darkCount < 14 && lightCount >= 14) {
    digitBlobs = blobsLight
  }

  // Target clean canvas for Tesseract OCR
  const size = 90
  const cleanCanvas = document.createElement('canvas')
  cleanCanvas.width = size
  cleanCanvas.height = size
  const cleanCtx = cleanCanvas.getContext('2d', { willReadFrequently: true })!

  cleanCtx.fillStyle = '#ffffff'
  cleanCtx.fillRect(0, 0, size, size)

  if (digitBlobs.length === 0) {
    return {
      canvas: cleanCanvas,
      hasInk: false,
      previewUrl: cleanCanvas.toDataURL('image/png'),
      holes: 0,
      aspect: 1,
      struct: 'unknown',
    }
  }

  // Determine tight bounding box of remaining digit blobs
  let minX = rawW, maxX = 0, minY = rawH, maxY = 0
  let digitPixelCount = 0

  const cleanBin = new Uint8Array(rawW * rawH)
  for (const b of digitBlobs) {
    digitPixelCount += b.pixels.length
    if (b.x0 < minX) minX = b.x0
    if (b.x1 > maxX) maxX = b.x1
    if (b.y0 < minY) minY = b.y0
    if (b.y1 > maxY) maxY = b.y1
    for (const p of b.pixels) {
      cleanBin[p] = 1
    }
  }

  const dbw = maxX - minX + 1
  const dbh = maxY - minY + 1
  const aspect = dbw / dbh
  const holes = countHoles(cleanBin, rawW, { x0: minX, y0: minY, x1: maxX, y1: maxY })
  const struct = checkDigitStructure2vs4(cleanBin, rawW, { x0: minX, y0: minY, x1: maxX, y1: maxY })

  // Scale and center digit onto clean 90x90 canvas with padding
  const targetMax = 58
  const scale = targetMax / Math.max(dbw, dbh)
  const drawW = Math.round(dbw * scale)
  const drawH = Math.round(dbh * scale)
  const offsetX = Math.round((size - drawW) / 2)
  const offsetY = Math.round((size - drawH) / 2)

  // Render isolated digit pixels cleanly onto clean canvas
  const isolatedCanvas = document.createElement('canvas')
  isolatedCanvas.width = dbw
  isolatedCanvas.height = dbh
  const isoCtx = isolatedCanvas.getContext('2d')!
  const isoImgData = isoCtx.createImageData(dbw, dbh)

  for (let y = 0; y < dbh; y++) {
    for (let x = 0; x < dbw; x++) {
      const srcIdx = (minY + y) * rawW + (minX + x)
      const dstIdx = (y * dbw + x) * 4
      if (cleanBin[srcIdx]) {
        isoImgData.data[dstIdx] = 0
        isoImgData.data[dstIdx + 1] = 0
        isoImgData.data[dstIdx + 2] = 0
        isoImgData.data[dstIdx + 3] = 255
      } else {
        isoImgData.data[dstIdx] = 255
        isoImgData.data[dstIdx + 1] = 255
        isoImgData.data[dstIdx + 2] = 255
        isoImgData.data[dstIdx + 3] = 255
      }
    }
  }
  isoCtx.putImageData(isoImgData, 0, 0)

  // Draw scaled and centered digit onto clean output canvas
  cleanCtx.imageSmoothingEnabled = true
  cleanCtx.imageSmoothingQuality = 'high'
  cleanCtx.drawImage(isolatedCanvas, 0, 0, dbw, dbh, offsetX, offsetY, drawW, drawH)

  const previewUrl = cleanCanvas.toDataURL('image/png')
  const hasInk = digitPixelCount >= 22 && dbh >= 12

  return { canvas: cleanCanvas, hasInk, previewUrl, holes, aspect, struct }
}

let workerPromise: Promise<TessWorker> | null = null

async function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: '123456789',
        tessedit_pageseg_mode: PSM.SINGLE_CHAR,
      })
      return worker
    })
  }
  return workerPromise
}

export async function ocrCell(canvas: HTMLCanvasElement): Promise<{ text: string; conf: number }> {
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas)
  return { text: (data.text ?? '').trim(), conf: Math.round(data.confidence) }
}

// --------------------------------------------------------------------------
// Validation of Sudoku rule conflicts
// --------------------------------------------------------------------------

function computeConflicts(grid: number[][]): boolean[][] {
  const conflicts = Array.from({ length: 9 }, () => Array(9).fill(false))

  // Check rows
  for (let r = 0; r < 9; r++) {
    const seen: Record<number, number[]> = {}
    for (let c = 0; c < 9; c++) {
      const val = grid[r][c]
      if (val > 0) {
        seen[val] = seen[val] || []
        seen[val].push(c)
      }
    }
    for (const val in seen) {
      if (seen[val].length > 1) {
        for (const c of seen[val]) conflicts[r][c] = true
      }
    }
  }

  // Check columns
  for (let c = 0; c < 9; c++) {
    const seen: Record<number, number[]> = {}
    for (let r = 0; r < 9; r++) {
      const val = grid[r][c]
      if (val > 0) {
        seen[val] = seen[val] || []
        seen[val].push(r)
      }
    }
    for (const val in seen) {
      if (seen[val].length > 1) {
        for (const r of seen[val]) conflicts[r][c] = true
      }
    }
  }

  // Check 3x3 boxes
  for (let boxR = 0; boxR < 3; boxR++) {
    for (let boxC = 0; boxC < 3; boxC++) {
      const seen: Record<number, [number, number][]> = {}
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const r = boxR * 3 + dr
          const c = boxC * 3 + dc
          const val = grid[r][c]
          if (val > 0) {
            seen[val] = seen[val] || []
            seen[val].push([r, c])
          }
        }
      }
      for (const val in seen) {
        if (seen[val].length > 1) {
          for (const [r, c] of seen[val]) conflicts[r][c] = true
        }
      }
    }
  }

  return conflicts
}

export async function extractGrid(
  image: HTMLImageElement,
  rect: Rect,
  lines: GridLines | null,
  onProgress?: (done: number, total: number) => void
): Promise<Extracted> {
  const rows = lines?.rows ?? uniformBoundaries()
  const cols = lines?.cols ?? uniformBoundaries()

  const grid: number[][] = []
  const confidence: number[][] = []
  const previews: string[][] = []
  let done = 0

  for (let j = 0; j < 9; j++) {
    const row: number[] = []
    const confRow: number[] = []
    const prevRow: string[] = []

    for (let i = 0; i < 9; i++) {
      const { canvas, hasInk, previewUrl, holes, aspect, struct } = makeCellCanvas(
        image,
        rect,
        cols[i],
        cols[i + 1],
        rows[j],
        rows[j + 1]
      )

      prevRow.push(previewUrl)

      if (!hasInk) {
        row.push(0)
        confRow.push(100)
      } else {
        let { text, conf } = await ocrCell(canvas)
        let val = 0
        const m = text.match(/[1-9]/)
        if (m) val = Number(m[0])

        // Structural & Topological Disambiguation
        if (val === 2 && struct === '4') {
          // Correct 4 misclassified as 2
          val = 4
          conf = Math.max(82, conf)
        } else if (val === 4 && struct === '2') {
          // Correct 2 misclassified as 4
          val = 2
          conf = Math.max(82, conf)
        } else if (aspect < 0.35 && val !== 1) {
          // Very narrow vertical digit is almost certainly a 1
          val = 1
          conf = Math.max(80, conf)
        } else if (holes >= 2 && (val === 3 || val === 0) && conf < 65) {
          // Only reclassify to 8 if Tesseract was low-confidence or confused on 3/0
          val = 8
          conf = Math.max(75, conf)
        } else if (holes === 1 && (val === 1 || val === 7)) {
          // If a digit has an enclosed hole but Tesseract read 1/7, flag low confidence for review
          conf = Math.min(conf, 45)
        }

        row.push(val)
        confRow.push(conf)
      }
      done++
      onProgress?.(done, 81)
    }
    grid.push(row)
    confidence.push(confRow)
    previews.push(prevRow)
  }

  const conflicts = computeConflicts(grid)

  return { grid, confidence, conflicts, previews }
}

