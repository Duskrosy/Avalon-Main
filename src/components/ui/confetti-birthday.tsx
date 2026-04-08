"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

export function ConfettiBirthday() {
  useEffect(() => {
    const end = Date.now() + 2500;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#3A5635", "#F4E2D0", "#D57B0E", "#ffffff", "#facc15"],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#3A5635", "#F4E2D0", "#D57B0E", "#ffffff", "#facc15"],
      });

      if (Date.now() < end) requestAnimationFrame(frame);
    };

    frame();
  }, []);

  return null;
}
