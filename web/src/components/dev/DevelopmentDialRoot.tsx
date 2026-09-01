"use client";

import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { IconSettings } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import {
  setActiveDevelopmentTuner,
  useActiveDevelopmentTuner,
  type DevelopmentTunerId,
} from "./developmentTunerStore";
import styles from "./DevelopmentDialRoot.module.css";

const DEVELOPMENT_TUNERS: ReadonlyArray<{
  id: DevelopmentTunerId;
  label: string;
}> = [
  {
    id: "home-hero",
    label: "Section Hero",
  },
];

export function DevelopmentDialRoot() {
  const activeTuner = useActiveDevelopmentTuner();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!isMenuOpen) return;

    menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      launcherRef.current?.focus();
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        launcherRef.current?.contains(target)
      ) {
        return;
      }
      setIsMenuOpen(false);
    };

    document.addEventListener("keydown", closeMenu);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [isMenuOpen]);

  if (!activeTuner) {
    return (
      <div className={styles.launcherShell}>
        {isMenuOpen ? (
          <div
            ref={menuRef}
            id="idea-commons-tuner-menu"
            className={styles.menu}
            role="menu"
            aria-label="Choisir un panneau de réglages"
          >
            {DEVELOPMENT_TUNERS.map((tuner) => (
              <button
                key={tuner.id}
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setIsMenuOpen(false);
                  setActiveDevelopmentTuner(tuner.id);
                }}
              >
                {tuner.label}
              </button>
            ))}
          </div>
        ) : null}
        <button
          ref={launcherRef}
          type="button"
          className={styles.launcher}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls="idea-commons-tuner-menu"
          aria-label="Ouvrir les réglages"
          title="Réglages"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <IconSettings
            className={styles.settingsIcon}
            size={24}
            stroke={2}
            aria-hidden="true"
          />
        </button>
      </div>
    );
  }

  return (
    <div id="idea-commons-development-tuner">
      <DialRoot
        defaultOpen
        position="bottom-right"
        theme="dark"
        onOpenChange={(open) => {
          if (!open) setActiveDevelopmentTuner(null);
        }}
      />
    </div>
  );
}
