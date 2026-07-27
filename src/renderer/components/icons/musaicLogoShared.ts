export const MUSAIC_LOGO_VIEWBOX = '0 0 512 512'
export const MUSAIC_LOGO_EXPORT_SIZE = 512
export const MUSAIC_LOGO_BACKGROUND_FILL = '#0B0E14'
export const MUSAIC_APP_ICON_SYMBOL_SCALE = 0.9
export const MUSAIC_APP_ICON_SQUIRCLE_INSET_RATIO = 32 / 512
export const MUSAIC_APP_ICON_SQUIRCLE_RADIUS_RATIO = 0.22

export const MUSAIC_LOGO_LEFT_PATH = 'M160 180 L 240 130 L 240 382 L 160 332 Z'
export const MUSAIC_LOGO_RIGHT_PATH = 'M272 130 L 352 180 L 352 332 L 272 382 Z'
export const MUSAIC_LOGO_CIRCLE_PATH = 'M256 64 C 362 64 448 150 448 256 C 448 362 362 448 256 448 C 150 448 64 362 64 256 C 64 150 150 64 256 64 Z'


export interface MusaicLogoSvgMarkupOptions {
  includeBackground?: boolean
  mainFill?: string
  shadowFill?: string
  backgroundFill?: string
  symbolScale?: number
}

interface MusaicLogoPngRenderOptions extends MusaicLogoSvgMarkupOptions {
  backgroundMode?: 'svg' | 'squircle'
  squircleInsetRatio?: number
  squircleRadiusRatio?: number
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function buildMusaicLogoSvgMarkup(options: MusaicLogoSvgMarkupOptions): string {
  const includeBackground = options.includeBackground ?? true
  const backgroundFill = options.backgroundFill ?? MUSAIC_LOGO_BACKGROUND_FILL
  const symbolScale = Number.isFinite(options.symbolScale ?? 1)
    ? Math.max(0.2, Math.min(3, options.symbolScale ?? 1))
    : 1
  const symbolTransform = symbolScale === 1
    ? ''
    : ` transform="translate(256 256) scale(${symbolScale}) translate(-256 -256)"`

  const backgroundLayer = includeBackground
    ? `<rect width="512" height="512" rx="128" fill="${backgroundFill}" />`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MUSAIC_LOGO_EXPORT_SIZE}" height="${MUSAIC_LOGO_EXPORT_SIZE}" viewBox="${MUSAIC_LOGO_VIEWBOX}" fill="none">
  <defs>
    <linearGradient id="musaicGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8A2BE2" />
      <stop offset="50%" stop-color="#4A00E0" />
      <stop offset="100%" stop-color="#00D2FF" />
    </linearGradient>
    <linearGradient id="musaicGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FF007A" />
      <stop offset="100%" stop-color="#7928CA" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  ${backgroundLayer}
  <g id="symbol"${symbolTransform} filter="url(#glow)">
    <path d="${MUSAIC_LOGO_CIRCLE_PATH}" stroke="url(#musaicGrad1)" stroke-width="8" stroke-dasharray="24 12" fill="none" opacity="0.8" />
    <path d="${MUSAIC_LOGO_LEFT_PATH}" fill="url(#musaicGrad1)" />
    <path d="${MUSAIC_LOGO_RIGHT_PATH}" fill="url(#musaicGrad2)" />
    <rect x="246" y="160" width="20" height="192" rx="10" fill="#00FFFF" />
    <rect x="196" y="200" width="20" height="112" rx="10" fill="#FF007A" />
    <rect x="296" y="200" width="20" height="112" rx="10" fill="#8A2BE2" />
  </g>
</svg>`
}

export function createMusaicLogoSvgDataUrl(options: MusaicLogoSvgMarkupOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMusaicLogoSvgMarkup(options))}`
}

export async function renderMusaicLogoPngDataUrl(
  options: MusaicLogoPngRenderOptions,
  size = MUSAIC_LOGO_EXPORT_SIZE
): Promise<string | null> {
  const dimension = Math.max(16, Math.min(2048, Math.round(size)))
  const backgroundMode = options.backgroundMode ?? 'svg'
  const squircleInsetRatio = Math.max(0, Math.min(0.2, options.squircleInsetRatio ?? MUSAIC_APP_ICON_SQUIRCLE_INSET_RATIO))
  const squircleRadiusRatio = Math.max(0.1, Math.min(0.45, options.squircleRadiusRatio ?? MUSAIC_APP_ICON_SQUIRCLE_RADIUS_RATIO))
  const svgOptions: MusaicLogoSvgMarkupOptions = {
    ...options,
    includeBackground: backgroundMode === 'svg' ? (options.includeBackground ?? true) : false,
  }
  const backgroundColor = options.backgroundFill ?? MUSAIC_LOGO_BACKGROUND_FILL
  const svgDataUrl = createMusaicLogoSvgDataUrl(svgOptions)

  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'sync'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = dimension
      canvas.height = dimension

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      ctx.clearRect(0, 0, dimension, dimension)
      if (backgroundMode === 'squircle') {
        const inset = Math.round(dimension * squircleInsetRatio)
        const squircleSize = Math.max(1, dimension - (inset * 2))
        const radius = Math.round(squircleSize * squircleRadiusRatio)
        drawRoundedRectPath(ctx, inset, inset, squircleSize, squircleSize, radius)
        ctx.fillStyle = backgroundColor
        ctx.fill()
        ctx.save()
        drawRoundedRectPath(ctx, inset, inset, squircleSize, squircleSize, radius)
        ctx.clip()
        ctx.drawImage(image, 0, 0, dimension, dimension)
        ctx.restore()
        resolve(canvas.toDataURL('image/png'))
        return
      }

      ctx.drawImage(image, 0, 0, dimension, dimension)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => resolve(null)
    image.src = svgDataUrl
  })
}

