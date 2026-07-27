import {
  rasterizeSignal,
  type SignalLayout
} from '@boof2015/astra-signal'
import {
  MUSAIC_LOGO_LEFT_PATH,
  MUSAIC_LOGO_RIGHT_PATH
} from '../components/icons/musaicLogoShared'

export const SIGNAL_EXPORT_SCALE = 6
export const SIGNAL_FOREGROUND = '#0b0b12'
export const SIGNAL_BACKGROUND = '#f4f4f6'

const SIGNAL_FOREGROUND_RGB = [11, 11, 18] as const
const SIGNAL_BACKGROUND_RGB = [244, 244, 246] as const
const BRAND_WIDTH_MODULES = 46
const BRAND_PADDING_MODULES = 10
const BRAND_LOGO_SIZE_MODULES = 34
const BRAND_LOGO_X_MODULES = 3
const BRAND_LOGO_Y_MODULES = 3
const LOGO_VIEWBOX_SIZE = 512

export interface SignalShareCanvasSize {
  width: number
  height: number
}

export function getSignalShareCanvasSize(layout: SignalLayout): SignalShareCanvasSize {
  return {
    width: (layout.widthModules + BRAND_WIDTH_MODULES + BRAND_PADDING_MODULES * 2) * SIGNAL_EXPORT_SCALE,
    height: (layout.heightModules + BRAND_PADDING_MODULES * 2) * SIGNAL_EXPORT_SCALE
  }
}

export function renderSignalShareCanvas(
  canvas: HTMLCanvasElement,
  layout: SignalLayout
): void {
  const size = getSignalShareCanvasSize(layout)
  canvas.width = size.width
  canvas.height = size.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('The Signal preview canvas is unavailable.')

  context.fillStyle = SIGNAL_BACKGROUND
  context.fillRect(0, 0, size.width, size.height)

  const raster = rasterizeSignal(layout, {
    scale: SIGNAL_EXPORT_SCALE,
    foreground: SIGNAL_FOREGROUND_RGB,
    background: SIGNAL_BACKGROUND_RGB
  })
  const signalImage = context.createImageData(raster.width, raster.height)
  signalImage.data.set(raster.data)
  context.putImageData(
    signalImage,
    (BRAND_PADDING_MODULES + BRAND_WIDTH_MODULES) * SIGNAL_EXPORT_SCALE,
    BRAND_PADDING_MODULES * SIGNAL_EXPORT_SCALE
  )

  const logoScale = (BRAND_LOGO_SIZE_MODULES * SIGNAL_EXPORT_SCALE) / LOGO_VIEWBOX_SIZE
  const translateX = (BRAND_PADDING_MODULES + BRAND_LOGO_X_MODULES) * SIGNAL_EXPORT_SCALE
  const translateY = (BRAND_PADDING_MODULES + BRAND_LOGO_Y_MODULES) * SIGNAL_EXPORT_SCALE

  context.save()
  context.setTransform(logoScale, 0, 0, logoScale, translateX, translateY)
  context.fillStyle = SIGNAL_FOREGROUND
  context.fill(new Path2D(MUSAIC_LOGO_LEFT_PATH))
  context.fill(new Path2D(MUSAIC_LOGO_RIGHT_PATH))
  context.restore()
}

export function signalShareCanvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The Signal PNG could not be created.'))
        return
      }
      void blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject)
    }, 'image/png')
  })
}
