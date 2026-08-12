// CounterPoint brand mark — two elements only:
// A horizontal deep-teal counter bar and an amber point (circle) above it,
// offset left of centre. Clean SVG geometry, no raster tracing.

type Props = {
  size?: number;
  className?: string;
  /** Compact mode: just the mark without the wordmark */
  compact?: boolean;
  /** For dark/teal backgrounds: use light wordmark */
  onDark?: boolean;
};

export function CounterPointMark({ size = 32, className = "", compact = false, onDark = false }: Props) {
  // ViewBox is 200x120 (200 unit bar + space for the 40 unit circle + gap)
  const vb = "0 0 200 120";
  const barY = 80;        // bar vertical position
  const barW = 200;       // bar length
  const barH = 14;        // bar thickness
  const barRx = 4;       // subtle rounding
  const circleR = 20;     // 40 unit diameter -> r=20
  const circleCx = 50;    // 50 units left of bar centre (100-50=50)
  const circleCy = 20;    // top area, 40 unit gap to bar top (bar top = 80, circle bottom = 40, gap = 40)

  const mark = (
    <svg
      width={size}
      height={size * (120 / 200)}
      viewBox={vb}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Amber point */}
      <circle cx={circleCx} cy={circleCy} r={circleR} fill="var(--color-amber, #ECBA82)" />
      {/* Deep teal counter */}
      <rect
        x={0}
        y={barY}
        width={barW}
        height={barH}
        rx={barRx}
        fill={onDark ? "#F3F1EC" : "var(--color-teal, #024F46)"}
      />
    </svg>
  );

  if (compact) {
    return mark;
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {mark}
      <span
        className="font-display text-base leading-none"
        style={{ color: onDark ? "#F3F1EC" : "var(--color-foreground, #2E2E2E)" }}
      >
        CounterPoint
      </span>
    </div>
  );
}

/** Favicon SVG — just the mark at 32px equivalent */
export function CounterPointFavicon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 200 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="20" r="20" fill="#ECBA82" />
      <rect x="0" y="80" width="200" height="14" rx="4" fill="#024F46" />
    </svg>
  );
}