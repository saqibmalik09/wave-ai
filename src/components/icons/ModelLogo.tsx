/*
  Model marks drawn inline in code. These are simplified, original glyphs (not
  the vendors' trademarked logo files) so nothing is hotlinked and the page can
  never break from a dead image URL. Colors echo each brand for recognizability.
*/

export type ModelKey =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "grok"
  | "mistral"
  | "perplexity"
  | "qwen"
  | "meta"
  | "kimi";

function Tile({
  bg,
  fg = "#fff",
  letter,
  size,
}: {
  bg: string;
  fg?: string;
  letter: string;
  size: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={bg} />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fontFamily="var(--font-jakarta), sans-serif"
        fill={fg}
      >
        {letter}
      </text>
    </svg>
  );
}

export function ModelLogo({
  model,
  size = 26,
}: {
  model: ModelKey;
  size?: number;
}) {
  switch (model) {
    case "claude":
      // Anthropic-style orange sunburst.
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
          <g
            stroke="#d97757"
            strokeWidth="2.4"
            strokeLinecap="round"
            transform="translate(16 16)"
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i * Math.PI) / 6;
              const r1 = 3.5;
              const r2 = 11;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * r1}
                  y1={Math.sin(a) * r1}
                  x2={Math.cos(a) * r2}
                  y2={Math.sin(a) * r2}
                />
              );
            })}
          </g>
        </svg>
      );
    case "gemini":
      // Four-point sparkle.
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M16 3c1 6.5 2.5 8 9 9-6.5 1-8 2.5-9 9-1-6.5-2.5-8-9-9 6.5-1 8-2.5 9-9Z"
            fill="#4285f4"
          />
        </svg>
      );
    case "openai":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="15" fill="#0a0a0a" />
          <path
            d="M16 8a8 8 0 0 1 7 4 6 6 0 0 1-2 10 8 8 0 0 1-14-4 6 6 0 0 1 2-10 8 8 0 0 1 7-0Z"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "grok":
      return <Tile bg="#0a0a0a" letter="x" size={size} />;
    case "deepseek":
      return <Tile bg="#4d6bfe" letter="D" size={size} />;
    case "mistral":
      return <Tile bg="#fa5111" letter="M" size={size} />;
    case "perplexity":
      return <Tile bg="#20808d" letter="P" size={size} />;
    case "qwen":
      return <Tile bg="#6f3cf5" letter="Q" size={size} />;
    case "meta":
      return <Tile bg="#0866ff" letter="∞" size={size} />;
    case "kimi":
      return <Tile bg="#111827" letter="K" size={size} />;
    default:
      return <Tile bg="#30a66d" letter="A" size={size} />;
  }
}
