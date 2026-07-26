"use client";

import { useCallback, useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

/**
 * NOT CURRENTLY RENDERED. The root layout dropped it during the palette rework
 * (the radial-glow layers carry the background on their own now), so nothing
 * imports this file and `@tsparticles/*` no longer reaches any bundle — the
 * packages stay in package.json for the same reason this file stays here.
 * Re-enabling it means re-adding one import in `app/layout.tsx`.
 */
export function ParticleBackground() {
  const [inited, setInited] = useState(false);

  useEffect(() => {
    // Skip on mobile (< 768px) and when user prefers reduced motion.
    // Prevents unnecessary GPU/battery drain on Capacitor iOS/Android.
    if (typeof window !== "undefined") {
      if (window.innerWidth < 768) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }

    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInited(true));
  }, []);

  const particlesOptions = {
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      number: { value: 60, density: { enable: true } },
      color: { value: ["#4C8DF6", "#A371F7", "#3FB950"] },
      shape: { type: "circle" },
      opacity: {
        value: { min: 0.05, max: 0.25 },
        animation: { enable: true, speed: 0.6, sync: false },
      },
      size: {
        value: { min: 1, max: 2.5 },
        animation: { enable: true, speed: 1, sync: false },
      },
      links: {
        enable: true,
        distance: 160,
        color: "#4C8DF6",
        opacity: 0.08,
        width: 1,
      },
      move: {
        enable: true,
        speed: 0.4,
        direction: "none" as const,
        random: true,
        straight: false,
        outModes: { default: "bounce" as const },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "repulse" as const },
        onClick: { enable: false },
      },
      modes: {
        repulse: { distance: 80, duration: 0.4 },
      },
    },
    detectRetina: true,
  };

  if (!inited) return null;

  return (
    <Particles
      id="neural-particles"
      className="fixed inset-0 z-0 pointer-events-none"
      options={particlesOptions}
    />
  );
}
