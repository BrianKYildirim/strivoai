import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronDown, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { motion } from "framer-motion";

const faqs = [
  {
    q: "Who is Strivo built for?",
    a: "Strivo is designed for students, early-career professionals, and experienced candidates who want an honest assessment of where they stand — and exactly what to improve. It works across industries including tech, finance, consulting, marketing, product, operations, and more.",
  },
  {
    q: "What will I actually get after I upload my resume?",
    a: "You'll receive a recruiter-grade report that shows: your ATS compatibility score, role-specific job fit scores, exact line-by-line resume fixes you can paste immediately, and a clear breakdown of what's holding you back from interviews. No generic advice — everything is tailored to your resume and target roles.",
  },
  {
    q: "How is Strivo different from other resume tools?",
    a: "Most tools give generic tips or keyword scores. Strivo evaluates your profile the way recruiters and ATS systems actually do — using real hiring signals, resume rubrics, and role-specific benchmarks. You don't just get feedback. You get clear decisions, priorities, and fixes.",
  },
  {
    q: "What is Career Compass, and why do free users get it?",
    a: "Career Compass shows you what roles you're currently competitive for, what roles are one step above your current level, and what skills or experience would unlock higher-paying paths. We include this for free because clarity about direction is the fastest way to improve outcomes.",
  },
  {
    q: "Is this useful if I'm switching careers or industries?",
    a: "Yes. Strivo is especially helpful for career pivots. It highlights transferable skills, gaps recruiters will notice, and how to reposition your experience for new roles — without inflating or misrepresenting your background.",
  },
  {
    q: "Can Strivo guarantee interviews or job offers?",
    a: "No. And no honest tool should. What Strivo does guarantee is accurate, actionable feedback based on real hiring standards — so you know exactly how to improve your chances instead of guessing.",
  },
  {
    q: "What is a credit?",
    a: "1 credit = 1 new AI analysis. Credits exist to cover compute costs and ensure fair usage. Viewing insights, copying text, and making edits don't cost credits.",
  },
  {
    q: "How long does analysis take?",
    a: "About 60 seconds. Our AI performs deep, recruiter-level analysis rather than surface-level scans — that depth is why it takes a moment longer than basic tools.",
  },
];

const Questions = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <>
      <Helmet>
        <title>FAQ — Strivo AI</title>
      </Helmet>

      <Navbar />

      <main className="pt-28 pb-20 px-4">
        <div className="container mx-auto max-w-xl">
          {/* Header */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3"
          >
            Frequently Asked Questions
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="text-muted-foreground mb-12"
          >
            Everything you need to know about Strivo
          </motion.p>

          {/* Accordion */}
          <div className="space-y-0">
            {faqs.map((faq, i) => (
              <div key={faq.q} className="border-b border-border/30">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between py-4 text-left gap-4 group"
                  aria-expanded={openIndex === i}
                >
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-200">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-300 ${
                      openIndex === i ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    openIndex === i ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="text-sm text-muted-foreground pb-4 pr-8 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Contact CTA */}
          <div className="mt-16 text-center">
            <p className="text-muted-foreground mb-3">Still have questions?</p>
            <a
              href="mailto:support@strivoai.net"
              className="inline-flex items-center gap-2 text-foreground font-medium hover:text-primary transition-colors duration-200"
            >
              Contact us
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Ready CTA */}
          <div className="mt-12 pt-12 border-t border-border/30 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-4">Ready to get started?</h3>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-6 py-3 font-medium hover:opacity-90 transition-opacity duration-200"
            >
              Start your analysis
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 md:py-10 px-4 border-t border-border/40">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">© 2025 Strivo. All rights reserved.</p>
            <div className="flex flex-wrap gap-4 md:gap-6 text-xs text-muted-foreground justify-center">
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link to="/refund" className="hover:text-foreground transition-colors">
                Refund
              </Link>
              <a href="mailto:support@strivoai.net" className="hover:text-foreground transition-colors">
                Contact
              </a>
              <Link to="/questions" className="hover:text-foreground transition-colors">
                Questions
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Questions;
