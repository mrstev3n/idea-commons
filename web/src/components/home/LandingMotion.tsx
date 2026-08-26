"use client";

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const hero = document.querySelector<HTMLElement>(".hero--stage");
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    root.dataset.motionReady = "true";

    if (reducedMotion.matches) {
      revealTargets.forEach((target) => {
        target.dataset.revealed = "true";
      });
      return () => {
        delete root.dataset.motionReady;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12%", threshold: 0.08 },
    );

    revealTargets.forEach((target) => observer.observe(target));

    let frame = 0;
    const setHeroVariables = () => {
      if (!hero) return;
      const bounds = hero.getBoundingClientRect();
      const travelled = Math.min(Math.max(-bounds.top, 0), Math.max(hero.offsetHeight, 1));
      const scrollProgress = travelled / Math.max(hero.offsetHeight, 1);
      hero.style.setProperty("--hero-scroll-shift", `${scrollProgress * 30}px`);
      hero.style.setProperty("--hero-copy-shift", `${scrollProgress * -14}px`);
    };

    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setHeroVariables());
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    setHeroVariables();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      delete root.dataset.motionReady;
    };
  }, []);

  return null;
}
