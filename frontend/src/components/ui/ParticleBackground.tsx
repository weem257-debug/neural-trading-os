"use client";

import { useCallback, useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export function ParticleBackground() {
  const [inited, setInited] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInited(true));
  }, []);

  const particlesOptions = {
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      number: { value: 60, density: { enable: true } },
      color: { value: ["#00D4FF", "#7B2FFF", "#00FF88"] },
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
        color: "#00D4FF",
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
