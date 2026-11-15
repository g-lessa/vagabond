import type { SVGProps } from 'react';

interface VagabondLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
  variant?: 'icon' | 'full' | 'text';
}

export function VagabondLogo({
  size = 32,
  variant = 'icon',
  className,
  style,
  ...rest
}: VagabondLogoProps) {
  if (variant === 'icon') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        aria-hidden="true"
        {...rest}
      >
        <defs>
          <linearGradient id="vb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        {/* Outer Ring & Reticle */}
        <circle cx="32" cy="32" r="30" stroke="url(#vb-grad)" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="25" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 4" strokeOpacity="0.5" />

        {/* Cardinal Ticks */}
        <line x1="32" y1="2" x2="32" y2="7" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="32" y1="57" x2="32" y2="62" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        <line x1="2" y1="32" x2="7" y2="32" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        <line x1="57" y1="32" x2="62" y2="32" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />

        {/* Meridians */}
        <ellipse cx="32" cy="32" rx="14" ry="25" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.35" />
        <ellipse cx="32" cy="32" rx="25" ry="10" stroke="#10b981" strokeWidth="1" strokeOpacity="0.35" />

        {/* Dynamic Faceted Needles */}
        <polygon points="32,9 37,29 32,26" fill="#f59e0b" />
        <polygon points="32,9 27,29 32,26" fill="#fbbf24" opacity="0.85" />

        <polygon points="32,55 37,35 32,38" fill="#0284c7" />
        <polygon points="32,55 27,35 32,38" fill="#0369a1" opacity="0.85" />

        <polygon points="55,32 35,37 38,32" fill="#10b981" />
        <polygon points="55,32 35,27 38,32" fill="#34d399" opacity="0.85" />

        <polygon points="9,32 29,37 26,32" fill="#0ea5e9" />
        <polygon points="9,32 29,27 26,32" fill="#38bdf8" opacity="0.85" />

        {/* Core Radar Beacon */}
        <circle cx="32" cy="32" r="4.5" fill="#0f172a" stroke="url(#vb-grad)" strokeWidth="2" />
        <circle cx="32" cy="32" r="1.8" fill="#f59e0b" />
      </svg>
    );
  }

  // Full variant: Icon + Wordmark
  const scale = size / 32;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${Math.round(8 * scale)}px`,
        textDecoration: 'none',
        lineHeight: 1,
        userSelect: 'none',
      }}
      className={className}
    >
      <VagabondLogo size={size} variant="icon" />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span
          style={{
            fontSize: `${Math.round(18 * scale)}px`,
            fontWeight: 900,
            letterSpacing: '0.06em',
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 60%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VAGABOND
        </span>
        <span
          style={{
            fontSize: `${Math.max(8, Math.round(7.5 * scale))}px`,
            fontWeight: 800,
            letterSpacing: '0.22em',
            color: '#10b981',
            marginBlockStart: '1px',
          }}
        >
          STREET EXPLORER
        </span>
      </div>
    </div>
  );
}
