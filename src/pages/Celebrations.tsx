import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { ChevronDown, Play, Pause, Upload, Linkedin, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

// ── Animation constants ──────────────────────────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const;
const VIEWPORT = { once: true, amount: 0.3 } as const;

// ── User Count Counter Hook ──────────────────────────────────────────────────
const useCounter = (target: number, durationMs: number, start: boolean): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;
    let raf: number;
    const startTime = performance.now();

    const tick = (now: number): void => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(Math.floor(eased * target));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);

  return count;
};

// ── Main Component ───────────────────────────────────────────────────────────
const Celebrations = (): JSX.Element => {
  // Profile state
  const [firstName, setFirstName] = useState("friend");

  // Section visibility delays
  const [showLetter, setShowLetter] = useState(false);
  const [showWhatsNext, setShowWhatsNext] = useState(false);

  // Audio player
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasPlayedRef = useRef(false);

  // User count
  const [startCounting, setStartCounting] = useState(false);
  const userCount = useCounter(12847, 2000, startCounting);

  // ── Fetch user profile ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchProfile = async (): Promise<void> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (profile?.full_name) {
          setFirstName(profile.full_name.split(" ")[0]);
        } else if (user.user_metadata?.full_name) {
          setFirstName((user.user_metadata.full_name as string).split(" ")[0]);
        } else if (user.email) {
          setFirstName(user.email.split("@")[0]);
        }
      } catch (err) {
        console.error("[Celebrations] Failed to fetch profile", err);
      }
    };

    fetchProfile();
  }, []);

  // ── Delay timers for letter and what's next ────────────────────────────────
  useEffect(() => {
    const letterTimer = setTimeout(() => setShowLetter(true), 3000);
    const whatsNextTimer = setTimeout(() => setShowWhatsNext(true), 4200);
    return () => {
      clearTimeout(letterTimer);
      clearTimeout(whatsNextTimer);
    };
  }, []);

  // Start counting after a short delay (hero is immediately visible)
  useEffect(() => {
    const timer = setTimeout(() => setStartCounting(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // ── Audio controls ─────────────────────────────────────────────────────────
  const togglePlay = (): void => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);

      if (!hasPlayedRef.current) {
        hasPlayedRef.current = true;
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
    }
  };

  const handleAudioEnd = (): void => {
    setIsPlaying(false);
  };

  // ── Visualizer bar durations ───────────────────────────────────────────────
  const barDurations = [0.4, 0.6, 0.5, 0.7];
  const barDelays = [0, 0.15, 0.05, 0.1];

  // ── Action cards data ──────────────────────────────────────────────────────
  const actionCards = [
    {
      icon: <Upload className="w-6 h-6" />,
      title: "Upload Your Resume",
      description: "Get an AI-powered analysis with actionable feedback",
      to: "/upload",
    },
    {
      icon: <Linkedin className="w-6 h-6" />,
      title: "Grade Your LinkedIn",
      description: "See how recruiters view your profile",
      to: "/linkedin-grader",
    },
    {
      icon: <Compass className="w-6 h-6" />,
      title: "Career Compass",
      description: "Map your next career moves with AI guidance",
      to: "/career-compass",
    },
  ];

  // ── Letter paragraphs ─────────────────────────────────────────────────────
  const letterParagraphs: { text: string; className?: string }[] = [
    { text: "most people never get to this point. not because they're not capable — but because they never take the first real step. you did.", className: "text-muted-foreground leading-[1.8]" },
    { text: "strivo wasn't built for people chasing average. it was built for people who know they're meant for more — and are willing to prove it.", className: "text-muted-foreground leading-[1.8]" },
    { text: "we've seen what actually happens behind the scenes. the 6-second scans. the silent rejections. the difference between getting noticed and getting ignored is rarely talent — it's positioning.", className: "text-muted-foreground leading-[1.8]" },
    { text: "that's your unfair advantage. clarity on how you're evaluated, what signals matter, and how to make them undeniable.", className: "text-lg text-foreground font-medium leading-[1.8]" },
    { text: "every feature here exists for one reason: to move you forward. not to make you feel busy — but to make you competitive.", className: "text-muted-foreground leading-[1.8]" },
    { text: "you're now part of something bigger. a community who refuse to give up — who take their future seriously and act on it.", className: "text-muted-foreground leading-[1.8]" },
    { text: "this is where things start to compound. sharper decisions. stronger signals. better outcomes.", className: "text-muted-foreground leading-[1.8]" },
    { text: "we're genuinely glad you're here — now let's build something exceptional, together.", className: "text-muted-foreground leading-[1.8]" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Section 1: Hero ──────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-[80vh] px-6 py-20 text-center overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/[0.08] blur-[120px] rounded-full pointer-events-none dark:bg-indigo-500/20" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-amber-500/[0.06] blur-[100px] rounded-full pointer-events-none dark:bg-amber-500/15" />

        {/* Pill badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="rounded-full border border-border bg-card/70 px-4 py-1.5 text-sm text-muted-foreground shadow-sm mb-8"
        >
          welcome aboard
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="text-5xl md:text-6xl font-semibold tracking-tight mb-6"
        >
          <span className="text-foreground">your </span>
          <span className="bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-700 bg-clip-text text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-blue-400">
            unfair advantage
          </span>
          <span className="text-foreground"> starts now.</span>
        </motion.h1>

        {/* Subcopy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
          className="max-w-2xl mx-auto mb-8"
        >
          <p className="text-lg md:text-xl leading-[1.8]">
            <span className="text-muted-foreground">why settle for </span>
            <span className="text-muted-foreground">average</span>
            <span className="text-muted-foreground"> when you were born to </span>
            <span className="bg-gradient-to-r from-yellow-700 via-orange-700 to-amber-700 bg-clip-text text-transparent font-medium dark:from-yellow-300 dark:via-orange-300 dark:to-amber-400">
              strive for excellence
            </span>
            <span className="text-muted-foreground">?</span>
          </p>
          <p className="text-lg md:text-xl text-muted-foreground leading-[1.8] mt-1">
            most people follow paths. the ones who win — build theirs.
          </p>
        </motion.div>

        {/* Social proof line */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
          className="text-muted-foreground text-sm mb-10"
        >
          you're user{" "}
          <span className="bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-700 bg-clip-text text-transparent font-bold dark:from-indigo-300 dark:via-violet-300 dark:to-blue-300">
            #{userCount.toLocaleString()}
          </span>{" "}
          to take their career seriously this month.
        </motion.p>

        {/* Bouncing arrow */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="w-8 h-8" />
        </motion.div>
      </section>

      {/* ── Section 2: Audio Player ──────────────────────────────────────── */}
      <section className="max-w-xl mx-auto px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1, ease: EASE }}
        >
          <Card className="p-6">
            <div className="flex items-center gap-4">
              {/* Play/Pause button */}
              <button
                type="button"
                onClick={togglePlay}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-primary text-foreground hover:bg-primary/90 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-background"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </button>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <p className="text-card-foreground font-medium truncate">Adventure of a Lifetime</p>
                <p className="text-muted-foreground text-sm">Coldplay</p>
              </div>

              {/* Visualizer bars */}
              <div className="flex items-end gap-1 h-8">
                {barDurations.map((duration, i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full bg-primary"
                    animate={
                      isPlaying
                        ? { height: ["12px", "28px", "12px"] }
                        : { height: "12px" }
                    }
                    transition={
                      isPlaying
                        ? {
                            duration,
                            delay: barDelays[i],
                            repeat: Infinity,
                            ease: "easeInOut",
                          }
                        : { duration: 0.3 }
                    }
                  />
                ))}
              </div>
            </div>

            <audio
              ref={audioRef}
              src="/adventureofalifetime.mp3"
              onEnded={handleAudioEnd}
              preload="none"
            />
          </Card>
        </motion.div>
      </section>

      {/* ── Section 3: Letter ────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <AnimatePresence>
          {showLetter && (
            <motion.div
              initial={{ opacity: 0, y: 40, filter: "blur(20px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: EASE }}
            >
              <Card className="p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-muted-foreground uppercase tracking-widest text-xs">
                    a note from strivo
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date().toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {/* Separator */}
                <div className="h-px bg-border my-4" />

                {/* Greeting */}
                <motion.p
                  initial={{ opacity: 0, y: 20, filter: "blur(14px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, ease: EASE }}
                  viewport={VIEWPORT}
                  className="text-xl text-foreground font-medium mb-6"
                >
                  hey — you made it.
                </motion.p>

                {/* Paragraphs with staggered blur-to-clear reveal */}
                {letterParagraphs.map((para, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, y: 20, filter: "blur(14px)" }}
                    whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.9, delay: i * 0.05, ease: EASE }}
                    viewport={{ once: true, margin: "-60px" }}
                    className={`mb-4 ${para.className || "text-muted-foreground leading-[1.8]"}`}
                  >
                    {para.text}
                  </motion.p>
                ))}

                {/* Signature */}
                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-muted-foreground">with ambition,</p>
                  <p className="flex items-center gap-1.5 mt-1 font-medium text-foreground">
                    the strivo team{" "}
                    <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="url(#heart-grad)">
                      <defs>
                        <linearGradient id="heart-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#fb7185" />
                          <stop offset="100%" stopColor="#ef4444" />
                        </linearGradient>
                      </defs>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Section 4: What's Next ───────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <AnimatePresence>
          {showWhatsNext && (
            <motion.div
              initial={{ opacity: 0, y: 40, filter: "blur(20px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: EASE }}
            >
              {/* Heading */}
              <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  what's next
                </h2>
                <p className="text-muted-foreground">
                  three things you can do right now
                </p>
              </div>

              {/* Action cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {actionCards.map((card, i) => (
                  <motion.div
                    key={card.to}
                    initial={{ opacity: 0, y: 30, filter: "blur(14px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{
                      duration: 0.8,
                      delay: i * 0.15,
                      ease: EASE,
                    }}
                    className="h-full"
                  >
                    <Link
                      to={card.to}
                      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Card className="flex h-full flex-col items-center text-center gap-3 p-6 transition-all hover:border-primary/30 hover:bg-secondary/50 hover:shadow-md">
                        <div className="bg-primary/10 text-primary p-3 rounded-full transition-colors group-hover:bg-primary/15">
                          {card.icon}
                        </div>
                        <h3 className="text-card-foreground font-semibold">{card.title}</h3>
                        <p className="text-muted-foreground text-sm">{card.description}</p>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* CTA button */}
              <div className="text-center">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-primary px-8 font-semibold text-foreground hover:bg-primary/90 dark:text-background"
                >
                  <Link to="/upload">Let's get started</Link>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default Celebrations;
