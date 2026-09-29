import { useEffect, useRef } from "react";

/** Very transparent neural mesh: brand blue edges, sky nodes. */
const NODE_RGB = "125, 211, 252";
const EDGE_RGB = "37, 99, 235";

interface Neuron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface NeuralBackgroundProps {
  /** Positioning/mask classes; the host element must be `relative`. */
  className?: string;
  /** Upper bound for the neuron count (density scales with viewport size). */
  maxNodes?: number;
  /** Hover state of the headline: brightens the mesh slightly. */
  boost?: boolean;
}

/**
 * GPU-cheap canvas mesh used as a decorative background.
 * - pauses when scrolled out of view or when the tab is hidden
 * - renders a single static frame for `prefers-reduced-motion`
 * - never intercepts pointer events and is hidden from assistive technology
 */
export default function NeuralBackground({ className = "", maxNodes = 80, boost = false }: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boostTarget = useRef(0);
  const redrawRef = useRef<(() => void) | null>(null);

  // Hovering the headline "warms up" the mesh. With reduced motion there is no
  // animation loop, so the static frame is repainted at the target intensity.
  useEffect(() => {
    boostTarget.current = boost ? 1 : 0;
    redrawRef.current?.();
  }, [boost]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const host = canvas.parentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let neurons: Neuron[] = [];
    let frame = 0;
    let inView = true;
    let pageVisible = document.visibilityState === "visible";
    let pointerActive = false;
    let currentLevel = boostTarget.current;
    const pointer = { x: 0.5, y: 0.5 };

    const linkDistance = () => (width < 640 ? 110 : 160);

    const seed = () => {
      const areaPerNode = width < 640 ? 11000 : width < 1024 ? 14000 : 17000;
      const count = Math.max(14, Math.min(maxNodes, Math.round((width * height) / areaPerNode)));
      neurons = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: 0.9 + Math.random() * 1.5
      }));
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      const maxDistance = linkDistance();
      const driftX = pointerActive ? (pointer.x - 0.5) * 16 : 0;
      const driftY = pointerActive ? (pointer.y - 0.5) * 16 : 0;
      const level = reduceMotion ? boostTarget.current : currentLevel;
      const intensity = 1 + level * 0.9;

      for (let i = 0; i < neurons.length; i += 1) {
        const a = neurons[i];

        for (let j = i + 1; j < neurons.length; j += 1) {
          const b = neurons[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > maxDistance) continue;

          const alpha = (1 - distance / maxDistance) * 0.075 * intensity;
          context.strokeStyle = `rgba(${EDGE_RGB}, ${alpha.toFixed(3)})`;
          context.lineWidth = 0.6;
          context.beginPath();
          context.moveTo(a.x + driftX, a.y + driftY);
          context.lineTo(b.x + driftX, b.y + driftY);
          context.stroke();
        }

        context.fillStyle = `rgba(${NODE_RGB}, ${(0.16 * intensity).toFixed(3)})`;
        context.beginPath();
        context.arc(a.x + driftX, a.y + driftY, a.r, 0, Math.PI * 2);
        context.fill();
      }
    };

    const tick = () => {
      if (!inView || !pageVisible) {
        frame = 0;
        return;
      }

      currentLevel += (boostTarget.current - currentLevel) * 0.07;

      for (const neuron of neurons) {
        neuron.x += neuron.vx;
        neuron.y += neuron.vy;
        if (neuron.x <= 6 || neuron.x >= width - 6) neuron.vx *= -1;
        if (neuron.y <= 6 || neuron.y >= height - 6) neuron.vy *= -1;
      }

      draw();
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduceMotion || frame !== 0 || !inView || !pageVisible) return;
      frame = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame === 0) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const resize = () => {
      const rect = host?.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect?.width ?? canvas.clientWidth));
      height = Math.max(1, Math.floor(rect?.height ?? canvas.clientHeight));

      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(scale, 0, 0, scale, 0, 0);

      seed();
      draw();
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerActive = true;
      pointer.x = event.clientX / Math.max(1, window.innerWidth);
      pointer.y = event.clientY / Math.max(1, window.innerHeight);
    };

    const handlePointerLeave = () => {
      pointerActive = false;
    };

    const handleVisibility = () => {
      pageVisible = document.visibilityState === "visible";
      if (pageVisible) start();
      else stop();
    };

    const resizeObserver = new ResizeObserver(resize);
    if (host) resizeObserver.observe(host);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        if (inView) start();
        else stop();
      },
      { rootMargin: "120px" }
    );
    intersectionObserver.observe(canvas);

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);

    redrawRef.current = draw;
    resize();
    start();

    return () => {
      redrawRef.current = null;
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [maxNodes]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      role="presentation"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
