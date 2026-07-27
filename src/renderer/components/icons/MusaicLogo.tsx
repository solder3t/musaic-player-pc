import {
  MUSAIC_LOGO_BACKGROUND_FILL,
  MUSAIC_LOGO_VIEWBOX,
} from './musaicLogoShared'

interface MusaicLogoProps {
  size?: number
  includeBackground?: boolean
  className?: string
}

export default function MusaicLogo({
  size = 12,
  includeBackground = false,
  className,
}: MusaicLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MUSAIC_LOGO_VIEWBOX}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="musaicCompGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8A2BE2" />
          <stop offset="50%" stop-color="#4A00E0" />
          <stop offset="100%" stop-color="#00D2FF" />
        </linearGradient>
        <linearGradient id="musaicCompGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FF007A" />
          <stop offset="100%" stop-color="#7928CA" />
        </linearGradient>
      </defs>

      {includeBackground && (
        <rect width="512" height="512" rx="128" fill={MUSAIC_LOGO_BACKGROUND_FILL} />
      )}

      <g id="symbol">
        <path d="M256 64 C 362 64 448 150 448 256 C 448 362 362 448 256 448 C 150 448 64 362 64 256 C 64 150 150 64 256 64 Z" stroke="url(#musaicCompGrad1)" stroke-width="8" stroke-dasharray="24 12" fill="none" opacity="0.8" />
        <path d="M160 180 L 240 130 L 240 382 L 160 332 Z" fill="url(#musaicCompGrad1)" />
        <path d="M272 130 L 352 180 L 352 332 L 272 382 Z" fill="url(#musaicCompGrad2)" />
        <rect x="246" y="160" width="20" height="192" rx="10" fill="#00FFFF" />
        <rect x="196" y="200" width="20" height="112" rx="10" fill="#FF007A" />
        <rect x="296" y="200" width="20" height="112" rx="10" fill="#8A2BE2" />
      </g>
    </svg>
  )
}
