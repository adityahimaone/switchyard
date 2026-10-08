import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { ReactNode } from "react";
import {
  Bot,
  Code2,
  Command,
  GitBranch,
  Layers,
  Network,
  PenTool,
  Server,
  TestTube2,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoMark } from "@/components/app/brand";
import { cn } from "@/lib/utils";

export interface Integration {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Real brand mark where one exists: a single SVG path (24x24). */
  brandPath?: string;
  /** Full inline brand SVG for multi-element marks (carries its own viewBox). */
  brandSvg?: ReactNode;
  /** Raster brand asset served from /brand. */
  iconSrc?: string;
  /** Position on the 564x410 scene, whose centre is (282, 205). */
  x: number;
  y: number;
  /** Connector line drawn from the centre mark to this node. */
  path: string;
  delay: number;
}

// Multi-element brand marks, inlined from each project's own favicon.
// CodeGraph's mark uses currentColor for its edges so it tracks the
// node tone; its node fills are the brand's own.
const CODEGRAPH_SVG = (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    className="h-full w-full"
    aria-hidden="true"
    focusable="false"
  >
    <line x1="16" y1="8" x2="8" y2="23" stroke="currentColor" strokeWidth="2" />
    <line x1="16" y1="8" x2="24" y2="23" stroke="currentColor" strokeWidth="2" />
    <line x1="8" y1="23" x2="24" y2="23" stroke="currentColor" strokeWidth="2" />
    <circle cx="16" cy="8" r="3.4" fill="var(--brand-codegraph-node)" stroke="var(--brand-codegraph-node)" />
    <circle cx="8" cy="23" r="3.4" fill="var(--brand-codegraph-node-off)" />
    <circle cx="24" cy="23" r="3.4" fill="var(--brand-codegraph-node-off)" />
  </svg>
);

const OMP_SVG = (
  <svg
    viewBox="0 0 64 64"
    className="h-full w-full"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id="omp-mark-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--brand-omp-a)" />
        <stop offset=".5" stopColor="var(--brand-omp-b)" />
        <stop offset="1" stopColor="var(--brand-omp-c)" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="12" fill="var(--brand-omp-tile)" />
    <path fill="url(#omp-mark-g)" d="M14 16h36v8H40v32h-8V24h-6v22h-8V24h-4z" />
  </svg>
);

// Real brand marks (simple-icons, CC0) for the public tools; internal
// Switchyard tools keep their lucide glyphs. The eleven nodes ring the
// centre mark on the 564x410 scene, each joined by its own connector.
// The ring is deliberately wide (rx 240, ry 165) so every mark keeps
// clear space from the Switchyard logo at the centre.
export const INTEGRATIONS: Integration[] = [
  {
    id: "commandcode",
    label: "commandcode",
    icon: Command,
    x: 42,
    y: 205,
    path: "M 282 205 L 42 205",
    delay: 0,
  },
  {
    id: "pen-dev",
    label: "pen.dev",
    icon: PenTool,
    iconSrc: "/brand/pen-dev-nib.png",
    x: 80,
    y: 116,
    path: "M 282 205 L 80 116",
    delay: 0.1,
  },
  {
    id: "codegraph",
    label: "codegraph",
    icon: Network,
    brandSvg: CODEGRAPH_SVG,
    x: 182,
    y: 55,
    path: "M 282 205 L 182 55",
    delay: 0.2,
  },
  {
    id: "node-agent",
    label: "node agent",
    icon: Server,
    x: 316,
    y: 42,
    path: "M 282 205 L 316 42",
    delay: 0.3,
  },
  {
    id: "e2e",
    label: "e2e (Playwright)",
    icon: TestTube2,
    brandPath:
      "M23.996 7.462c-.056.837-.257 2.135-.716 3.85-.995 3.715-4.27 10.874-10.42 9.227-6.15-1.65-5.407-9.487-4.412-13.201.46-1.716.934-2.94 1.305-3.694.42-.853.846-.289 1.815.523.684.573 2.41 1.791 5.011 2.488 2.601.697 4.706.506 5.583.352 1.245-.219 1.897-.494 1.834.455Zm-9.807 3.863s-.127-1.819-1.773-2.286c-1.644-.467-2.613 1.04-2.613 1.04Zm4.058 4.539-7.769-2.172s.446 2.306 3.338 3.153c2.862.836 4.43-.98 4.43-.981Zm2.701-2.51s-.13-1.818-1.773-2.286c-1.644-.469-2.612 1.038-2.612 1.038ZM8.57 18.23c-4.749 1.279-7.261-4.224-8.021-7.08C.197 9.831.044 8.832.003 8.188c-.047-.73.455-.52 1.415-.354.677.118 2.3.261 4.308-.28a11.28 11.28 0 0 0 2.41-.956c-.058.197-.114.4-.17.61-.433 1.618-.827 4.055-.632 6.426-1.976.732-2.267 2.423-2.267 2.423l2.524-.715c.227 1.002.6 1.987 1.15 2.838a5.914 5.914 0 0 1-.171.049Zm-4.188-6.298c1.265-.333 1.363-1.631 1.363-1.631l-3.374.888s.745 1.076 2.01.743Z",
    x: 439,
    y: 80,
    path: "M 282 205 L 439 80",
    delay: 0.4,
  },
  {
    id: "hermes",
    label: "hermes",
    icon: Bot,
    iconSrc: "/brand/hermes-agent.webp",
    x: 512,
    y: 159,
    path: "M 282 205 L 512 159",
    delay: 0.5,
  },
  {
    id: "git",
    label: "git",
    icon: GitBranch,
    brandPath:
      "M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z",
    x: 512,
    y: 251,
    path: "M 282 205 L 512 251",
    delay: 0.6,
  },
  {
    id: "deepseek",
    label: "deepseek",
    icon: Layers,
    brandPath:
      "M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45",
    x: 439,
    y: 330,
    path: "M 282 205 L 439 330",
    delay: 0.7,
  },
  {
    id: "codex",
    label: "codex (OpenAI)",
    icon: Code2,
    brandPath:
      "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
    x: 316,
    y: 368,
    path: "M 282 205 L 316 368",
    delay: 0.8,
  },
  {
    id: "omp",
    label: "omp",
    icon: Layers,
    brandSvg: OMP_SVG,
    x: 182,
    y: 355,
    path: "M 282 205 L 182 355",
    delay: 0.9,
  },
  {
    id: "tailscale",
    label: "tailscale",
    icon: Waypoints,
    x: 80,
    y: 294,
    path: "M 282 205 L 80 294",
    delay: 1,
  },
];

export function IntegrationGlyph({
  integration,
  className,
}: {
  integration: Integration;
  className?: string;
}) {
  if (integration.iconSrc) {
    return (
      <img
        src={integration.iconSrc}
        alt=""
        className={cn("object-contain", className)}
        draggable={false}
      />
    );
  }
  if (integration.brandSvg) {
    return (
      <span className={cn("inline-flex items-center justify-center", className)}>
        {integration.brandSvg}
      </span>
    );
  }
  if (integration.brandPath) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        <path d={integration.brandPath} />
      </svg>
    );
  }
  const Icon = integration.icon;
  return <Icon className={className} aria-hidden="true" focusable={false} />;
}

/** One connector: a faint base line plus an accent dash that
 *  travels along it, fading at both ends via the gradient. */
function AnimatedPath({
  d,
  id,
  index,
  reducedMotion,
}: {
  d: string;
  id: string;
  index: number;
  reducedMotion: boolean | null;
}) {
  return (
    <>
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        className="text-line"
      />
      {!reducedMotion && (
        <motion.path
          d={d}
          stroke={`url(#${id})`}
          strokeWidth="2"
          fill="none"
          strokeDasharray="40 160"
          initial={{ strokeDashoffset: 200 }}
          animate={{ strokeDashoffset: -200 }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear",
            delay: index * 0.3,
          }}
        />
      )}
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="var(--c-accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </>
  );
}

/**
 * The dotted, gradient-washed band behind the scene. It spans the
 * full card width; the scene itself keeps the prompt's size, centred
 * inside the band.
 */
export function VisualContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("relative w-full overflow-hidden bg-canvas", className)}
    >
      {/* Dots background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--c-ink) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-raised/60 from-10% via-transparent to-90% to-raised/60" />
      {/* Scene, at the prompt's size, centred in the band */}
      <div className="relative z-10 mx-auto w-full max-w-141 px-8 py-8">
        <div className="relative aspect-564/460 w-full sm:aspect-564/410">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The integration scene: the Switchyard mark at the centre, the real
 * tool marks ringed around it, and a travelling dash on every
 * connector. Each node reveals its name on hover — the pill flips
 * below the mark for the nodes on the top half of the ring.
 */
export function Integration() {
  const containerId = useId();
  const reducedMotion = useReducedMotion();

  return (
    <div className="relative h-full w-full">
      {/* Connector lines */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 564 410"
        fill="none"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {INTEGRATIONS.map((integration, i) => (
          <AnimatedPath
            key={integration.id}
            d={integration.path}
            id={`${containerId}-${integration.id}`}
            index={i}
            reducedMotion={reducedMotion}
          />
        ))}
      </svg>

      {/* Centre mark */}
      <div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-line bg-raised p-0.5 shadow-float sm:rounded-xl sm:p-2 sm:shadow-lift">
        <div className="rounded-lg border border-line p-1 sm:rounded-xl sm:p-2.5">
          <LogoMark className="size-5 sm:size-9" />
        </div>
        {!reducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-lg border-2 border-accent/10 sm:rounded-xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        )}
      </div>

      {/* Peripheral icons */}
      {INTEGRATIONS.map((integration) => {
        // Nodes on the top half of the ring reveal their pill below
        // the mark so it never clips the top of the scene.
        const pillBelow = integration.y < 150;
        return (
          <motion.div
            key={integration.id}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: integration.delay }}
            style={{
              left: `${(integration.x / 564) * 100}%`,
              top: `${(integration.y / 410) * 100}%`,
            }}
            title={integration.label}
            className="group absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-line bg-raised text-ink shadow-float sm:h-12 sm:w-12 sm:rounded-xl"
          >
            <IntegrationGlyph
              integration={integration}
              className="h-4 w-4 text-ink sm:h-6 sm:w-6"
            />
            {/* Title revealed on hover */}
            <span
              className={cn(
                "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-raised px-2 py-1 font-mono text-[10px] font-medium text-ink opacity-0 shadow-lift transition-all duration-200 group-hover:opacity-100",
                pillBelow
                  ? "-bottom-9 group-hover:translate-y-0.5"
                  : "-top-9 group-hover:-translate-y-0.5",
              )}
            >
              {integration.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export const IntegrationCard = ({
  visual,
  title,
  description,
  url,
  ctaLabel,
}: {
  visual?: ReactNode;
  title?: string;
  description?: string;
  url?: string;
  ctaLabel?: string;
}) => {
  return (
    <Card className="glass-card w-full overflow-hidden">
      <VisualContainer>{visual}</VisualContainer>

      <CardContent className="flex flex-col gap-6 p-6 sm:gap-8 sm:p-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-medium tracking-tight text-ink sm:text-2xl">
            {title}
          </h3>
          <p className="text-base leading-relaxed text-ink-2">
            {description}
          </p>
        </div>
        <Button
          variant="signal"
          className="h-10 w-fit shrink-0 cursor-pointer rounded-full px-5"
          onClick={() => {
            if (!url) return;
            if (url.startsWith("#")) {
              document
                .getElementById(url.slice(1))
                ?.scrollIntoView({ behavior: "smooth" });
            } else {
              window.open(url, "_blank", "noopener");
            }
          }}
        >
          {ctaLabel}
        </Button>
      </CardContent>
    </Card>
  );
};

export function IntegrationCardDemo() {
  return (
    <IntegrationCard
      visual={<Integration />}
      title="Switchyard Integrations"
      description="CodeGraph feeds every executor its context, pen.dev designs the canvas before a line of code, e2e verifies the flow — and hermes, codex, deepseek, omp and commandcode carry each card from intent to done over the node agent and git."
      url="#full-reference"
      ctaLabel="Full reference"
    />
  );
}

export default IntegrationCardDemo;
