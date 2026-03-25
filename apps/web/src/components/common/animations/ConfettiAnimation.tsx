// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef } from 'react';

import { useReducedMotion } from '../../../hooks/useReducedMotion';

export interface ConfettiAnimationProps {
  /** Width of the canvas in CSS pixels. */
  width?: number;
  /** Height of the canvas in CSS pixels. */
  height?: number;
  /** Number of confetti particles. */
  particleCount?: number;
  /** Burst duration in milliseconds. */
  duration?: number;
  /** Callback fired when the animation finishes. */
  onComplete?: () => void;
  /** Additional CSS class name. */
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  width: number;
  height: number;
  gravity: number;
  opacity: number;
}

const COLORS = [
  '#648fff', // blue
  '#785ef0', // purple
  '#dc267f', // magenta
  '#fe6100', // orange
  '#ffb000', // gold
  '#22c55e', // green
];

function createParticle(canvasWidth: number, canvasHeight: number): Particle {
  return {
    x: canvasWidth / 2 + (Math.random() - 0.5) * canvasWidth * 0.3,
    y: canvasHeight * 0.5,
    vx: (Math.random() - 0.5) * 12,
    vy: -(Math.random() * 10 + 5),
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    width: Math.random() * 8 + 4,
    height: Math.random() * 6 + 2,
    gravity: 0.12 + Math.random() * 0.06,
    opacity: 1,
  };
}

/**
 * Canvas-based confetti burst animation for goal milestones and achievements.
 *
 * Uses `OffscreenCanvas` when available for better performance.
 * Shows a static emoji fallback when `prefers-reduced-motion: reduce` is active.
 */
export function ConfettiAnimation({
  width = 300,
  height = 200,
  particleCount = 60,
  duration = 2500,
  onComplete,
  className = '',
}: ConfettiAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  const animate = useCallback(
    (canvas: HTMLCanvasElement) => {
      // Use OffscreenCanvas if supported, else fall back to regular context
      let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          const offscreen = canvas.transferControlToOffscreen();
          ctx = offscreen.getContext('2d');
        } catch {
          // transferControlToOffscreen can only be called once; fall back
          ctx = canvas.getContext('2d');
        }
      } else {
        ctx = canvas.getContext('2d');
      }

      if (!ctx) return;

      const particles: Particle[] = Array.from({ length: particleCount }, () =>
        createParticle(width, height),
      );

      const startTime = performance.now();
      let rafId: number;

      const draw = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        ctx!.clearRect(0, 0, width, height);

        for (const p of particles) {
          p.vy += p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.rotationSpeed;
          p.opacity = Math.max(0, 1 - progress * 1.2);

          ctx!.save();
          ctx!.translate(p.x, p.y);
          ctx!.rotate(p.rotation);
          ctx!.globalAlpha = p.opacity;
          ctx!.fillStyle = p.color;
          ctx!.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
          ctx!.restore();
        }

        if (progress < 1) {
          rafId = requestAnimationFrame(draw);
        } else {
          onComplete?.();
        }
      };

      rafId = requestAnimationFrame(draw);

      return () => cancelAnimationFrame(rafId);
    },
    [width, height, particleCount, duration, onComplete],
  );

  useEffect(() => {
    if (reducedMotion) {
      // Fire onComplete immediately for reduced-motion users
      onComplete?.();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    return animate(canvas);
  }, [reducedMotion, animate, onComplete]);

  if (reducedMotion) {
    return (
      <div
        className={`confetti-animation ${className}`.trim()}
        role="img"
        aria-label="Celebration"
        data-testid="confetti-static"
      >
        <span className="confetti-animation__static" aria-hidden="true">
          🎉
        </span>
      </div>
    );
  }

  return (
    <div className={`confetti-animation ${className}`.trim()} role="img" aria-label="Celebration">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="confetti-animation__canvas"
        data-testid="confetti-canvas"
        aria-hidden="true"
      />
    </div>
  );
}

export default ConfettiAnimation;
