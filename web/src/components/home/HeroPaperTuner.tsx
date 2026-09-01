"use client";

import { useDialKitController, type DialConfig } from "dialkit";
import { useEffect, useRef } from "react";
import {
  HERO_PAPER_TUNING_DEFAULTS,
  type HeroPaperTuning,
  type HeroPaperTuningByViewport,
} from "@/components/home/HeroPaperTuning";
import styles from "./HeroPaperTuner.module.css";

type DialViewportTuning = {
  ensemble: HeroPaperTuning["group"];
  papier3D: HeroPaperTuning["paper"];
  texte: HeroPaperTuning["text"];
};

type ControlDefault = {
  path: string;
  value: number;
};

const VIEWPORT_KEYS = ["desktop", "tablette", "mobile"] as const;

function createViewportConfig(
  defaults: HeroPaperTuning,
  collapsed: boolean,
) {
  return {
    _collapsed: collapsed,
    ensemble: {
      _collapsed: false,
      positionX: [defaults.group.positionX, -400, 400, 1],
      positionY: [defaults.group.positionY, -320, 320, 1],
      scale: [defaults.group.scale, 0.5, 1.8, 0.01],
      rotationX: [defaults.group.rotationX, -45, 45, 0.5],
      rotationY: [defaults.group.rotationY, -45, 45, 0.5],
      rotationZ: [defaults.group.rotationZ, -30, 30, 0.5],
      perspective: [defaults.group.perspective, 400, 2400, 8],
    },
    papier3D: {
      _collapsed: true,
      positionX: [defaults.paper.positionX, -240, 240, 1],
      positionY: [defaults.paper.positionY, -240, 240, 1],
      scale: [defaults.paper.scale, 0.5, 1.8, 0.01],
      rotationX: [defaults.paper.rotationX, -60, 60, 0.5],
      rotationY: [defaults.paper.rotationY, -60, 60, 0.5],
      rotationZ: [defaults.paper.rotationZ, -45, 45, 0.5],
      cameraFov: [defaults.paper.cameraFov, 12, 60, 0.5],
    },
    texte: {
      _collapsed: true,
      positionX: [defaults.text.positionX, -240, 240, 1],
      positionY: [defaults.text.positionY, -240, 240, 1],
      scale: [defaults.text.scale, 0.5, 1.8, 0.01],
      rotationX: [defaults.text.rotationX, -45, 45, 0.5],
      rotationY: [defaults.text.rotationY, -45, 45, 0.5],
      rotationZ: [defaults.text.rotationZ, -30, 30, 0.5],
    },
  } satisfies DialConfig;
}

const HERO_TUNER_CONFIG = {
  reinitialiserEnHaut: { type: "action", label: "Réinitialiser tout" },
  toutReduire: { type: "action", label: "Tout réduire" },
  desktop: createViewportConfig(HERO_PAPER_TUNING_DEFAULTS.desktop, false),
  tablette: createViewportConfig(HERO_PAPER_TUNING_DEFAULTS.tablet, true),
  mobile: createViewportConfig(HERO_PAPER_TUNING_DEFAULTS.mobile, true),
  reinitialiserEnBas: { type: "action", label: "Réinitialiser tout" },
} satisfies DialConfig;

function collectViewportControls(
  viewport: (typeof VIEWPORT_KEYS)[number],
  defaults: HeroPaperTuning,
): ControlDefault[] {
  return [
    { path: `${viewport}.ensemble.positionX`, value: defaults.group.positionX },
    { path: `${viewport}.ensemble.positionY`, value: defaults.group.positionY },
    { path: `${viewport}.ensemble.scale`, value: defaults.group.scale },
    { path: `${viewport}.ensemble.rotationX`, value: defaults.group.rotationX },
    { path: `${viewport}.ensemble.rotationY`, value: defaults.group.rotationY },
    { path: `${viewport}.ensemble.rotationZ`, value: defaults.group.rotationZ },
    { path: `${viewport}.ensemble.perspective`, value: defaults.group.perspective },
    { path: `${viewport}.papier3D.positionX`, value: defaults.paper.positionX },
    { path: `${viewport}.papier3D.positionY`, value: defaults.paper.positionY },
    { path: `${viewport}.papier3D.scale`, value: defaults.paper.scale },
    { path: `${viewport}.papier3D.rotationX`, value: defaults.paper.rotationX },
    { path: `${viewport}.papier3D.rotationY`, value: defaults.paper.rotationY },
    { path: `${viewport}.papier3D.rotationZ`, value: defaults.paper.rotationZ },
    { path: `${viewport}.papier3D.cameraFov`, value: defaults.paper.cameraFov },
    { path: `${viewport}.texte.positionX`, value: defaults.text.positionX },
    { path: `${viewport}.texte.positionY`, value: defaults.text.positionY },
    { path: `${viewport}.texte.scale`, value: defaults.text.scale },
    { path: `${viewport}.texte.rotationX`, value: defaults.text.rotationX },
    { path: `${viewport}.texte.rotationY`, value: defaults.text.rotationY },
    { path: `${viewport}.texte.rotationZ`, value: defaults.text.rotationZ },
  ];
}

const CONTROL_DEFAULTS = [
  ...collectViewportControls("desktop", HERO_PAPER_TUNING_DEFAULTS.desktop),
  ...collectViewportControls("tablette", HERO_PAPER_TUNING_DEFAULTS.tablet),
  ...collectViewportControls("mobile", HERO_PAPER_TUNING_DEFAULTS.mobile),
];
const CONTROL_DEFAULTS_BY_PATH = new Map(
  CONTROL_DEFAULTS.map((control) => [control.path, control]),
);

function toHeroTuning(values: DialViewportTuning): HeroPaperTuning {
  return {
    group: values.ensemble,
    paper: values.papier3D,
    text: values.texte,
  };
}

function flattenCurrentValues(
  values: Record<(typeof VIEWPORT_KEYS)[number], DialViewportTuning>,
) {
  const current = new Map<string, number>();
  for (const viewport of VIEWPORT_KEYS) {
    const model = toHeroTuning(values[viewport]);
    collectViewportControls(viewport, model).forEach((control) => {
      current.set(control.path, control.value);
    });
  }
  return current;
}

function getHeroPanel() {
  const rootTitles = document.querySelectorAll<HTMLElement>(
    ".dialkit-panel .dialkit-folder-title-root",
  );
  const heroTitle = Array.from(rootTitles).find(
    (title) => title.textContent?.trim() === "Hero",
  );
  return heroTitle?.closest<HTMLElement>(".dialkit-panel-inner");
}

function collapseAllHeroFolders() {
  getHeroPanel()
    ?.querySelectorAll<HTMLElement>(
      ".dialkit-folder:not(.dialkit-folder-root)[data-open='true'] > .dialkit-folder-header",
    )
    .forEach((header) => header.click());
}

function detectedViewportLabel() {
  if (window.innerWidth <= 760) return "Mobile";
  if (window.innerWidth <= 1030) return "Tablette";
  return "Desktop";
}

function openViewportFolder(label: string) {
  const panel = getHeroPanel();
  const controls = panel?.querySelector<HTMLElement>(
    ".dialkit-folder-root > .dialkit-folder-content > .dialkit-folder-inner",
  );
  const target = Array.from(
    controls?.querySelectorAll<HTMLElement>(":scope > .dialkit-folder") ?? [],
  ).find((folder) => {
    const title = folder.querySelector<HTMLElement>(
      ":scope > .dialkit-folder-header .dialkit-folder-title",
    );
    return title?.textContent?.trim() === label;
  });

  if (!target) return false;
  if (target.dataset.open !== "true") {
    target
      .querySelector<HTMLElement>(":scope > .dialkit-folder-header")
      ?.click();
  }
  return true;
}

const VIEWPORT_ICON_PATHS: Record<string, string[]> = {
  Desktop: [
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M7 21h10M9 16v5M15 16v5",
  ],
  Tablette: [
    "M6 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z",
    "M11 19h2",
  ],
  Mobile: [
    "M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z",
    "M11 18h2",
  ],
};

function addViewportIcon(folder: HTMLElement) {
  const title = folder.querySelector<HTMLElement>(
    ":scope > .dialkit-folder-header .dialkit-folder-title",
  );
  const label = title?.textContent?.trim();
  const paths = label ? VIEWPORT_ICON_PATHS[label] : null;
  const titleRow = title?.parentElement;
  if (!title || !titleRow || !paths) return;

  folder.classList.add(styles.viewportFolder);
  if (titleRow.querySelector(`.${styles.viewportIcon}`)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", styles.viewportIcon);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  paths.forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  });
  titleRow.insertBefore(svg, title);
}

function controlPathForRow(row: HTMLElement) {
  const sectionFolder = row.closest<HTMLElement>(
    ".dialkit-folder:not(.dialkit-folder-root)",
  );
  const viewportFolder = sectionFolder?.parentElement?.closest<HTMLElement>(
    ".dialkit-folder:not(.dialkit-folder-root)",
  );
  const sectionTitle = sectionFolder
    ?.querySelector<HTMLElement>(":scope > .dialkit-folder-header .dialkit-folder-title")
    ?.textContent?.trim();
  const viewportTitle = viewportFolder
    ?.querySelector<HTMLElement>(":scope > .dialkit-folder-header .dialkit-folder-title")
    ?.textContent?.trim();
  const controlTitle = row
    .querySelector<HTMLElement>(".dialkit-slider-label")
    ?.textContent?.trim();

  const viewport =
    viewportTitle === "Desktop"
      ? "desktop"
      : viewportTitle === "Tablette"
        ? "tablette"
        : viewportTitle === "Mobile"
          ? "mobile"
          : null;
  const section =
    sectionTitle === "Ensemble"
      ? "ensemble"
      : sectionTitle?.startsWith("Papier3")
        ? "papier3D"
        : sectionTitle === "Texte"
          ? "texte"
          : null;
  const controlNames: Record<string, string> = {
    "Position X": "positionX",
    "Position Y": "positionY",
    Scale: "scale",
    "Rotation X": "rotationX",
    "Rotation Y": "rotationY",
    "Rotation Z": "rotationZ",
    Perspective: "perspective",
    "Camera Fov": "cameraFov",
  };
  const control = controlTitle ? controlNames[controlTitle] : null;

  return viewport && section && control
    ? `${viewport}.${section}.${control}`
    : null;
}

type HeroPaperTunerProps = {
  onChange: (values: HeroPaperTuningByViewport) => void;
};

export function HeroPaperTuner({ onChange }: HeroPaperTunerProps) {
  const resetRef = useRef<() => void>(() => undefined);
  const setValueRef = useRef<(path: string, value: number) => void>(
    () => undefined,
  );
  const currentValuesRef = useRef(new Map<string, number>());
  const dial = useDialKitController("Hero", HERO_TUNER_CONFIG, {
    id: "home-hero",
    persist: {
      key: "idea-commons:tuner:home-hero:viewports",
      storage: "localStorage",
      presets: true,
    },
    onAction: (path) => {
      if (
        path === "reinitialiserEnHaut" ||
        path === "reinitialiserEnBas"
      ) {
        resetRef.current();
      }
      if (path === "toutReduire") collapseAllHeroFolders();
    },
  });
  resetRef.current = dial.resetValues;
  setValueRef.current = dial.setValue;
  currentValuesRef.current = flattenCurrentValues({
    desktop: dial.values.desktop,
    tablette: dial.values.tablette,
    mobile: dial.values.mobile,
  });

  useEffect(() => {
    const updateResetVisibility = (row: HTMLElement, path: string) => {
      const control = CONTROL_DEFAULTS_BY_PATH.get(path);
      const button = row.querySelector<HTMLButtonElement>(
        `.${styles.controlReset}`,
      );
      if (!control || !button) return;

      const isModified = !Object.is(
        currentValuesRef.current.get(path),
        control.value,
      );
      button.hidden = !isModified;
      row.classList.toggle(styles.isModified, isModified);
    };

    const decorateControls = () => {
      const panel = getHeroPanel();
      const controls = panel?.querySelector<HTMLElement>(
        ".dialkit-folder-root > .dialkit-folder-content > .dialkit-folder-inner",
      );
      const actionButtons = Array.from(
        controls?.querySelectorAll<HTMLButtonElement>(":scope > .dialkit-button") ?? [],
      );
      const topReset = actionButtons.find(
        (button) => button.textContent?.trim() === "Réinitialiser tout",
      );
      const collapseAll = actionButtons.find(
        (button) => button.textContent?.trim() === "Tout réduire",
      );

      controls?.classList.add(styles.heroControls);
      topReset?.classList.add(styles.topReset);
      if (collapseAll) {
        collapseAll.classList.add(styles.collapseAll);
        collapseAll.textContent = "⇈";
        collapseAll.title = "Tout réduire";
        collapseAll.setAttribute("aria-label", "Tout réduire");
      }

      controls
        ?.querySelectorAll<HTMLElement>(":scope > .dialkit-folder")
        .forEach(addViewportIcon);

      panel
        ?.querySelectorAll<HTMLElement>(".dialkit-slider-wrapper")
        .forEach((row) => {
          const path = controlPathForRow(row);
          const control = path ? CONTROL_DEFAULTS_BY_PATH.get(path) : null;
          if (!path || !control) return;

          if (row.dataset.ideaCommonsReset !== "true") {
            const label = row
              .querySelector<HTMLElement>(".dialkit-slider-label")
              ?.textContent?.trim();
            const button = document.createElement("button");

            row.dataset.ideaCommonsReset = "true";
            row.classList.add(styles.hasReset);
            button.type = "button";
            button.className = styles.controlReset;
            button.textContent = "↺";
            button.hidden = true;
            button.dataset.controlPath = path;
            button.title = `Réinitialiser ${label ?? path}`;
            button.setAttribute("aria-label", `Réinitialiser ${label ?? path}`);
            button.addEventListener("click", () => {
              setValueRef.current(path, control.value);
            });
            row.appendChild(button);
          }
          updateResetVisibility(row, path);
        });
    };

    decorateControls();
    const observer = new MutationObserver((mutations) => {
      decorateControls();

      const panel = getHeroPanel();
      const controls = panel?.querySelector<HTMLElement>(
        ".dialkit-folder-root > .dialkit-folder-content > .dialkit-folder-inner",
      );
      if (!controls) return;

      let openedViewport: HTMLElement | null = null;
      for (const mutation of mutations) {
        if (mutation.type !== "attributes") continue;
        const folder = mutation.target as HTMLElement;
        if (
          folder.parentElement === controls &&
          folder.classList.contains("dialkit-folder") &&
          folder.dataset.open === "true"
        ) {
          openedViewport = folder;
        }
      }

      if (!openedViewport) return;
      controls
        .querySelectorAll<HTMLElement>(
          ":scope > .dialkit-folder[data-open='true']",
        )
        .forEach((folder) => {
          if (folder === openedViewport) return;
          folder
            .querySelector<HTMLElement>(":scope > .dialkit-folder-header")
            ?.click();
        });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-open"],
    });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll(`.${styles.controlReset}`)
        .forEach((button) => button.remove());
    };
  }, []);

  useEffect(() => {
    let activeViewport: string | null = null;
    let pendingViewport: string | null = null;

    const applyPendingViewport = () => {
      if (!pendingViewport) return;
      if (openViewportFolder(pendingViewport)) pendingViewport = null;
    };
    const detectViewportChange = () => {
      const nextViewport = detectedViewportLabel();
      if (nextViewport === activeViewport) return;
      activeViewport = nextViewport;
      pendingViewport = nextViewport;
      applyPendingViewport();
    };

    detectViewportChange();
    const observer = new MutationObserver(applyPendingViewport);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", detectViewportChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", detectViewportChange);
    };
  }, []);

  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(`.${styles.hasReset}`)
      .forEach((row) => {
        const button = row.querySelector<HTMLButtonElement>(
          `.${styles.controlReset}`,
        );
        const path = button?.dataset.controlPath;
        const control = path ? CONTROL_DEFAULTS_BY_PATH.get(path) : null;
        if (!button || !path || !control) return;

        const isModified = !Object.is(
          currentValuesRef.current.get(path),
          control.value,
        );
        button.hidden = !isModified;
        row.classList.toggle(styles.isModified, isModified);
      });
  }, [dial.values]);

  useEffect(() => {
    onChange({
      desktop: toHeroTuning(dial.values.desktop),
      tablet: toHeroTuning(dial.values.tablette),
      mobile: toHeroTuning(dial.values.mobile),
    });
  }, [dial.values, onChange]);

  return null;
}
