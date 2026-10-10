import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Transition } from "framer-motion";

interface IntroAnimationProps {
  onComplete: () => void;
}

const IntroAnimation = ({ onComplete }: IntroAnimationProps) => {
  const [showIntro, setShowIntro] = useState(true);
  const [logoComplete, setLogoComplete] = useState(false);

  // Letters with their colors - STR in foreground, IVO in coral red
  const letters = [
    { char: "S", isRed: false },
    { char: "T", isRed: false },
    { char: "R", isRed: false },
    { char: "★", isRed: true, isStar: true },
    { char: "I", isRed: true },
    { char: "V", isRed: true },
    { char: "O", isRed: true },
  ];
  
  // Luxury easing - smooth, refined motion
  const luxuryTransition: Transition = {
    duration: 0.7,
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number]
  };

  useEffect(() => {
    // Logo animation completes after all letters + buffer
    const logoTimer = setTimeout(() => {
      setLogoComplete(true);
    }, 1200);

    // Hold for impact, then start fade out
    const holdTimer = setTimeout(() => {
      setShowIntro(false);
    }, 1600);

    // Complete callback after fade out finishes
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2300);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(holdTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {showIntro && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={luxuryTransition}
        >
          <div className="flex items-center justify-center">
            {letters.map((letter, index) => (
              <motion.span
                key={letter.char}
                className={`font-bold tracking-tight select-none ${
                  letter.isStar 
                    ? "text-3xl md:text-5xl lg:text-6xl mx-1" 
                    : "text-5xl md:text-7xl lg:text-8xl"
                }`}
                style={{ 
                  fontFamily: "'Inter', system-ui, sans-serif",
                  letterSpacing: "-0.02em",
                  color: letter.isRed ? "hsl(357 100% 68%)" : "hsl(var(--foreground))"
                }}
                initial={{ 
                  opacity: 0, 
                  y: 20,
                  filter: "blur(4px)"
                }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  filter: "blur(0px)"
                }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.1,
                  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number]
                }}
              >
                {letter.char}
              </motion.span>
            ))}
          </div>

          {/* Subtle glow effect after logo completes */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: logoComplete ? 0.3 : 0 }}
            transition={{ 
              duration: 0.4,
              ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number]
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/50" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IntroAnimation;
