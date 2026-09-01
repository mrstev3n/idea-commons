"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  HERO_PAPER_TUNING_DEFAULTS,
  type HeroPaperTuningByViewport,
  type HeroPaperViewport,
} from "@/components/home/HeroPaperTuning";

const HeroPaperSurface = dynamic(
  () => import("@/components/home/HeroPaperSurface").then((module) => module.HeroPaperSurface),
  { ssr: false },
);

const HeroPaperDevelopmentBridge =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@/components/home/HeroPaperDevelopmentBridge").then(
            (module) => module.HeroPaperDevelopmentBridge,
          ),
        { ssr: false },
      )
    : null;

type HeroTuningStyle = CSSProperties & Record<`--hero-${string}`, string | number>;

type HeroDossierProps = {
  title: string;
  slug: string;
  sourceLabel: string;
  publicationLabel: string;
  claimTypes: string[];
};

type PaperErrorBoundaryProps = {
  children: ReactNode;
  onUnavailable: () => void;
};

class PaperErrorBoundary extends Component<
  PaperErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onUnavailable();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const context =
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"));
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

export function HeroDossier({
  title,
  slug,
  sourceLabel,
  publicationLabel,
  claimTypes,
}: HeroDossierProps) {
  const [paperEnabled, setPaperEnabled] = useState(false);
  const [paperActive, setPaperActive] = useState(false);
  const [tuningByViewport, setTuningByViewport] =
    useState<HeroPaperTuningByViewport>(HERO_PAPER_TUNING_DEFAULTS);
  const [viewport, setViewport] = useState<HeroPaperViewport>("desktop");
  const paperUnavailable = useRef(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const webglAvailable = supportsWebGL();
    const updateCapability = () => {
      setPaperEnabled(
        !paperUnavailable.current &&
          desktop.matches &&
          finePointer.matches &&
          !reducedMotion.matches &&
          webglAvailable,
      );
    };

    updateCapability();
    desktop.addEventListener("change", updateCapability);
    finePointer.addEventListener("change", updateCapability);
    reducedMotion.addEventListener("change", updateCapability);

    return () => {
      desktop.removeEventListener("change", updateCapability);
      finePointer.removeEventListener("change", updateCapability);
      reducedMotion.removeEventListener("change", updateCapability);
    };
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      setViewport(
        window.innerWidth <= 760
          ? "mobile"
          : window.innerWidth <= 1030
            ? "tablet"
            : "desktop",
      );
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPaperActive(false);
  };
  const disablePaper = useCallback(() => {
    paperUnavailable.current = true;
    setPaperEnabled(false);
  }, []);

  const tuning =
    tuningByViewport[viewport] ?? HERO_PAPER_TUNING_DEFAULTS[viewport];
  const tuningStyle: HeroTuningStyle = {
    "--hero-group-position-x": `${tuning.group.positionX}px`,
    "--hero-group-position-y": `${tuning.group.positionY}px`,
    "--hero-group-scale": tuning.group.scale,
    "--hero-group-rotation-x": `${tuning.group.rotationX}deg`,
    "--hero-group-rotation-y": `${tuning.group.rotationY}deg`,
    "--hero-group-rotation-z": `${tuning.group.rotationZ}deg`,
    "--hero-group-perspective": `${tuning.group.perspective}px`,
    "--hero-text-position-x": `${tuning.text.positionX}px`,
    "--hero-text-position-y": `${tuning.text.positionY}px`,
    "--hero-text-scale": tuning.text.scale,
    "--hero-text-rotation-x": `${tuning.text.rotationX}deg`,
    "--hero-text-rotation-y": `${tuning.text.rotationY}deg`,
    "--hero-text-rotation-z": `${tuning.text.rotationZ}deg`,
  };

  return (
    <aside
      className="hero-dossier"
      aria-label={`Idée vedette : ${title}`}
      data-paper-enabled={paperEnabled ? "true" : "false"}
      style={tuningStyle}
      onPointerEnter={() => setPaperActive(true)}
      onPointerLeave={() => setPaperActive(false)}
      onFocusCapture={() => setPaperActive(true)}
      onBlurCapture={handleBlur}
    >
      {paperEnabled ? (
        <PaperErrorBoundary onUnavailable={disablePaper}>
          <HeroPaperSurface
            active={paperActive}
            onUnavailable={disablePaper}
            tuning={tuning.paper}
          />
        </PaperErrorBoundary>
      ) : null}
      <div className="hero-dossier__sheet">
        <p className="hero-dossier__eyebrow">Idée vérifiée</p>
        <h2>{title}</h2>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div>
            <dt>Publication</dt>
            <dd>{publicationLabel}</dd>
          </div>
        </dl>
        {claimTypes.length > 0 ? (
          <ul className="hero-dossier__claims" aria-label="Types d’affirmations">
            {claimTypes.map((type) => (
              <li key={type}>{type}</li>
            ))}
          </ul>
        ) : null}
        <Link href={`/idees/${slug}`}>Ouvrir l’idée</Link>
      </div>
      {HeroPaperDevelopmentBridge ? (
        <HeroPaperDevelopmentBridge onChange={setTuningByViewport} />
      ) : null}
    </aside>
  );
}
