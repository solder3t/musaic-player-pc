import appIconUrl from '../../assets/icon.png'

interface MusaicLogoProps {
  size?: number
  includeBackground?: boolean
  className?: string
}

export default function MusaicLogo({
  size = 18,
  includeBackground = false,
  className,
}: MusaicLogoProps) {
  return (
    <img
      src={appIconUrl}
      alt="Musaic"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block',
        borderRadius: includeBackground ? '22%' : undefined
      }}
      draggable={false}
    />
  )
}

