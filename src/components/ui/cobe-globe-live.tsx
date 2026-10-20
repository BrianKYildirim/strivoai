import createGlobe from "cobe";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MARKERS = [
  { location: [37.7749, -122.4194] as [number, number], size: 0.06, name: "San Francisco" },
  { location: [51.5074, -0.1278] as [number, number], size: 0.06, name: "London" },
  { location: [35.6762, 139.6503] as [number, number], size: 0.06, name: "Tokyo" },
  { location: [48.8566, 2.3522] as [number, number], size: 0.06, name: "Paris" },
  { location: [-33.8688, 151.2093] as [number, number], size: 0.06, name: "Sydney" },
  { location: [40.7128, -74.006] as [number, number], size: 0.06, name: "New York" },
  { location: [25.2048, 55.2708] as [number, number], size: 0.06, name: "Dubai" },
  { location: [1.3521, 103.8198] as [number, number], size: 0.06, name: "Singapore" },
  { location: [19.076, 72.8777] as [number, number], size: 0.06, name: "Mumbai" },
  { location: [52.52, 13.405] as [number, number], size: 0.06, name: "Berlin" },
  { location: [43.6532, -79.3832] as [number, number], size: 0.06, name: "Toronto" },
  { location: [34.0522, -118.2437] as [number, number], size: 0.06, name: "Los Angeles" },
];

const LIVE_INDICES = [0, 3, 7]; // SF, Paris, Singapore

interface GlobeLiveProps {
  speed?: number;
  className?: string;
}

export const GlobeLive = ({ speed = 0.002, className = "" }: GlobeLiveProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const pointerDownRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [opacity, setOpacity] = useState(0);
  const [liveTooltip, setLiveTooltip] = useState<string>(MARKERS[LIVE_INDICES[0]].name);

  // Rotate live tooltip every 3 seconds
  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % LIVE_INDICES.length;
      setLiveTooltip(MARKERS[LIVE_INDICES[idx]].name);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerDownRef.current) return;
    const dx = e.clientX - lastPointerRef.current.x;
    const dy = e.clientY - lastPointerRef.current.y;
    phiRef.current += dx * 0.005;
    thetaRef.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, thetaRef.current + dy * 0.005));
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: 600 * 2,
      height: 600 * 2,
      phi: 0,
      theta: 0.3,
      dark: 0,
      diffuse: 1.5,
      mapSamples: 16000,
      mapBrightness: 10,
      baseColor: [0.95, 0.95, 0.95],
      markerColor: [0.9, 0.2, 0.2],
      glowColor: [0.94, 0.93, 0.91],
      markers: MARKERS.map((m) => ({ location: m.location, size: m.size })),
    });

    // Animation loop
    const animate = () => {
      if (!pointerDownRef.current) {
        phiRef.current += speed;
      }
      globe.update({ phi: phiRef.current, theta: thetaRef.current });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    // Fade in after init
    const timer = setTimeout(() => setOpacity(1), 200);

    return () => {
      globe.destroy();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      clearTimeout(timer);
    };
  }, [speed]);

  return (
    <div className={`relative ${className}`}>
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>

      {/* Live badge - stable container, only inner text animates */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-background/90 border border-border/40 px-3 py-1 text-xs font-medium shadow-sm">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"
          style={{ animation: "live-pulse 1.5s ease-in-out infinite" }}
        />
        <span className="text-muted-foreground">LIVE</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={liveTooltip}
            className="text-foreground"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
          >
            {liveTooltip}
          </motion.span>
        </AnimatePresence>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          maxWidth: 500,
          aspectRatio: "1",
          opacity,
          transition: "opacity 0.8s ease-in-out",
          display: "block",
          margin: "0 auto",
        }}
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
      />
    </div>
  );
};
