import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import HomepageRouter from "@/components/HomepageRouter";
import IntroAnimation from "@/components/IntroAnimation";
import HomepageErrorBoundary from "@/components/HomepageErrorBoundary";
import { useIntroAnimation } from "@/hooks/useIntroAnimation";

const Index = () => {
  const { showIntro, introComplete, handleIntroComplete } = useIntroAnimation();

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Strivo",
    url: "https://strivoai.net",
    logo: "https://strivoai.net/strivo-logo.png",
    description: "AI-powered resume analyzer that helps job seekers beat ATS systems and land interviews.",
    sameAs: [],
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Strivo - AI Resume Analyzer",
    url: "https://strivoai.net",
    description: "Beat the ATS, Win Interviews. AI-powered resume optimization and career guidance.",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://strivoai.net/?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Who is Strivo built for?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Strivo is designed for students, early-career professionals, and experienced candidates who want an honest assessment of where they stand — and exactly what to improve. It works across industries including tech, finance, consulting, marketing, product, operations, and more.",
        },
      },
      {
        "@type": "Question",
        name: "What will I actually get after I upload my resume?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You'll receive a recruiter-grade report that shows: your ATS compatibility score, role-specific job fit scores, exact line-by-line resume fixes you can paste immediately, and a clear breakdown of what's holding you back from interviews.",
        },
      },
      {
        "@type": "Question",
        name: "How is Strivo different from other resume tools?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Most tools give generic tips or keyword scores. Strivo evaluates your profile the way recruiters and ATS systems actually do — using real hiring signals, resume rubrics, and role-specific benchmarks. You don't just get feedback. You get clear decisions, priorities, and fixes.",
        },
      },
      {
        "@type": "Question",
        name: "What is Career Compass, and why do free users get it?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Career Compass shows you what roles you're currently competitive for, what roles are one step above your current level, and what skills or experience would unlock higher-paying paths. We include this for free because clarity about direction is the fastest way to improve outcomes.",
        },
      },
      {
        "@type": "Question",
        name: "Is Strivo useful for career changers?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Strivo is especially helpful for career pivots. It highlights transferable skills, gaps recruiters will notice, and how to reposition your experience for new roles — without inflating or misrepresenting your background.",
        },
      },
      {
        "@type": "Question",
        name: "How long does resume analysis take?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "About 60 seconds. Our AI performs deep, recruiter-level analysis rather than surface-level scans — that depth is why it takes a moment longer than basic tools.",
        },
      },
    ],
  };

  // Don't render anything until we know if we should show intro
  if (showIntro === null) {
    return (
      <div className="min-h-viewport bg-background" />
    );
  }

  return (
    <HomepageErrorBoundary>
      <Helmet>
        <title>Strivo AI</title>
        <meta name="description" content="AI-powered resume analyzer that helps you beat Applicant Tracking Systems and land your dream job. Get instant feedback, ATS scoring, and personalized job recommendations." />
        <link rel="canonical" href="https://strivoai.net" />
        <meta name="keywords" content="resume analyzer, AI resume, ATS checker, resume scanner, job application, career tools, resume optimization, Strivo AI" />
        <script type="application/ld+json">
          {JSON.stringify(organizationSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(websiteSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(faqSchema)}
        </script>
      </Helmet>

      {/* Intro Animation */}
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}

      {/* Homepage with reveal animation */}
      <AnimatePresence>
        {introComplete && (
          <motion.div
            key="homepage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
            }}
          >
            <HomepageRouter />
          </motion.div>
        )}
      </AnimatePresence>
    </HomepageErrorBoundary>
  );
};

export default Index;
