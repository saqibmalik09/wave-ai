import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { ModelLogo, type ModelKey } from "@/components/icons/ModelLogo";

/**
 * Display labels for the marketing strip. Proper nouns — not translated.
 * Existing names stay; new names are appended. Order is the round-robin source.
 */
const models = [
  "GPT-5.6",
  "Claude Opus 5",
  "Gemini 3 Pro",
  "DeepSeek V4",
  "Grok 4",
  "Mistral Large",
  "Sonar",
  "Qwen 3.5",
  "Llama 4",
  "Kimi K2",
  "GPT-5.6 Luna",
  "GPT 5.6 Sol",
  "GPT-5 mini",
  "Claude Sonnet 5",
  "GPT-4o mini",
  "Claude Haiku 4.5",
  "Gemini 3 Flash",
  "GPT-5.2",
  "DeepSeek V4 Pro",
  "GPT-4.1",
  "Mistral Large 3",
  "Gemini 3.1 Pro",
  "Mistral Small",
  "Codestral",
  "Grok 4.5",
  "Nova Pro",
  "Grok 4.20 (Reasoning)",
  "Wan 3.0",
  "Qwen 3.7 Max",
  "Veo 3.1",
  "MiniMax H3",
  "Qwen Plus",
  "Seedream 5.0",
  "Kimi K2.5",
  "GPT Image 2",
  "Nova Premier 1.0",
  "Nano Banana Pro",
  "Grok Imagine Pro",
  "Perplexity Sonar",
  "Kling v3",
  "Wan 3.0 Prime",
  "GPT-5.4 mini",
  "Seedance 2.5",
  "GPT-5 nano",
  "Runway Gen-4.5",
  "Gemini 3.5 Flash Lite",
  "Claude Sonnet 4.6",
  "Gemini 2.5 Flash",
  "GPT-5.6 Terra",
  "Qwen 3.5 Plus",
  "DeepSeek V4.1 Flash",
  "GPT-5.1",
  "Mistral Medium",
  "GPT-4o",
  "Ministral 3 8B",
  "Gemini 2.5 Pro",
  "Command R",
  "Grok 4.3",
  "Nova Lite",
  "Wan 2.7",
  "Grok 4.20 (Non-Reasoning)",
  "Gemini Omni Flash",
  "Qwen 3 Max",
  "MiniMax Hailuo 02",
  "Qwen Flash",
  "Seedream 4.5",
  "DeepSeek Reasoner",
  "GPT Image 1.5",
  "Nano Banana 2",
  "Magistral Medium",
  "Grok Imagine",
  "Claude Opus 4.8",
  "GPT-5.4 nano",
  "GPT 5.5",
  "GPT-4.1 nano",
  "Claude Sonnet 4.0",
  "Gemini 3.1 Flash Lite",
  "GPT-5.4",
  "Gemini 2.5 Lite",
  "Qwen 3.5 Flash",
  "GPT-5",
  "DeepSeek Chat",
  "Gemini 3.8 Flash",
  "Mistral Small 4",
  "Grok 4.7",
  "Ministral 3 3B",
  "Command R7B",
  "Nova Micro",
  "Seedance 2.0",
  "Qwen 3.8 Max",
  "Kling 3.0",
  "Qwen 3 Coder Flash",
  "Seedream 5.0 Pro",
  "Kimi K3",
  "Seedream 4.0",
  "Command A",
  "GPT Image 1",
  "Nano Banana",
  "Perplexity Sonar Pro",
] as const;

/** Top and bottom travel left; the center row travels right. */
const rowMotion = ["rtl", "ltr", "rtl"] as const;

function rowsOf(names: readonly string[]): string[][] {
  const rows: string[][] = [[], [], []];
  for (let i = 0; i < names.length; i++) {
    rows[i % 3].push(names[i]);
  }
  return rows;
}

/** Map a model name to one of our inline logo marks, if we have one. */
function inferKey(name: string): ModelKey | null {
  const n = name.toLowerCase();
  if (n.includes("gpt") || n.includes("codex")) return "openai";
  if (n.includes("claude")) return "claude";
  if (n.includes("gemini") || n.includes("nano banana") || n.includes("veo"))
    return "gemini";
  if (n.includes("deepseek")) return "deepseek";
  if (n.includes("grok")) return "grok";
  if (
    n.includes("mistral") ||
    n.includes("codestral") ||
    n.includes("magistral") ||
    n.includes("ministral")
  )
    return "mistral";
  if (n.includes("qwen") || n.includes("wan")) return "qwen";
  if (n.includes("kimi")) return "kimi";
  if (n.includes("perplexity") || n.includes("sonar")) return "perplexity";
  if (n.includes("llama")) return "meta";
  return null;
}

function ModelPill({ name }: { name: string }) {
  const key = inferKey(name);
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm">
      {key ? (
        <ModelLogo model={key} size={18} />
      ) : (
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
      )}
      {name}
    </span>
  );
}

function ModelRow({
  names,
  motion,
}: {
  names: string[];
  motion: (typeof rowMotion)[number];
}) {
  return (
    <div className="aw-marquee-row">
      <div className={`aw-marquee-track aw-marquee-${motion}`}>
        <div className="aw-marquee-set">
          {names.map((name) => (
            <ModelPill key={name} name={name} />
          ))}
        </div>
        <div className="aw-marquee-set" aria-hidden="true">
          {names.map((name) => (
            <ModelPill key={name} name={name} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ModelsStrip() {
  const rows = rowsOf(models);

  return (
    <section id="models" className="py-16 sm:py-24">
      <Container>
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
              100+ leading AI models. All right here.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted">
              Access top models for chat, images, video, coding, research and
              more — with one account.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 flex w-full flex-col gap-3">
          {rows.map((names, i) => (
            <ModelRow key={i} names={names} motion={rowMotion[i]} />
          ))}
        </div>
      </Container>
    </section>
  );
}
