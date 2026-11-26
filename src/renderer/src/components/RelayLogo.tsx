export function RelayLogo({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="./logo.svg"
      alt=""
      width={size}
      height={size}
      className={className}
    />
  )
}
