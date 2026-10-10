interface ScoreRingProps {
  score: number;
  size?: number;
  radius?: number;
  strokeWidth?: number;
}

export function ScoreRing({ score, size = 160, radius = 70, strokeWidth = 12 }: ScoreRingProps) {
  const half = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx={half}
          cy={half}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={half}
          cy={half}
          r={radius}
          fill="none"
          stroke="#FF6B6B"
          strokeWidth={strokeWidth}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span className="text-4xl font-bold" style={{ color: "#FF6B6B" }}>
          {score}%
        </span>
        <span className="text-xs text-muted-foreground">Ready</span>
      </div>
    </div>
  );
}
