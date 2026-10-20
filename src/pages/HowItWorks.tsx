import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Upload, BarChart3, FileText, Rocket, ArrowRight, X } from "lucide-react";
import { Helmet } from "react-helmet-async";
import HowItWorksFeatureCards from "@/components/HowItWorksFeatureCards";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const HowItWorks = () => {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const steps = [
    {
      number: "1",
      title: "Upload",
      description: "Add your resume in seconds",
      icon: <Upload className="h-6 w-6" />,
      details: [
        "Drag & drop or click to upload your PDF",
        "Works with any resume format or template",
        "Secure, encrypted file handling",
        "No account required to start",
      ],
    },
    {
      number: "2",
      title: "Analyze",
      description: "AI uncovers blind spots",
      icon: <BarChart3 className="h-6 w-6" />,
      details: [
        "Scores 8 critical hiring factors",
        "Detects ATS compatibility issues",
        "Identifies weak bullet points",
        "Benchmarks against industry standards",
      ],
    },
    {
      number: "3",
      title: "Review",
      description: "Copy exact rewrites",
      icon: <FileText className="h-6 w-6" />,
      details: [
        "Get ready-to-paste bullet rewrites",
        "See before/after comparisons",
        "Prioritized by impact on your score",
        "Recruiter-tested language patterns",
      ],
    },
    {
      number: "4",
      title: "Apply",
      description: "Outperform 90% of applicants",
      icon: <Rocket className="h-6 w-6" />,
      details: [
        "Pass ATS filters with confidence",
        "Stand out to human reviewers",
        "Track your score improvements",
        "Land more interview callbacks",
      ],
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.9 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
    },
  };

  return (
    <>
      <Helmet>
        <title>Strivo AI</title>
        <meta name="description" content="Learn how Strivo's AI analyzes your resume in 4 simple steps. Upload, get scored, review feedback, and apply with confidence." />
      </Helmet>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="pt-20 md:pt-24 lg:pt-28">
          {/* Hero Section */}
          <motion.section 
            className="py-10 md:py-14 lg:py-16 px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="container mx-auto max-w-4xl text-center">
              <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground mb-4 md:mb-6 tracking-tight">
                How <span className="text-primary">Strivo</span> Works
              </h1>
              <p className="text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Four simple steps to a job-winning resume that beats ATS filters and impresses recruiters.
              </p>
            </div>
          </motion.section>

          {/* Steps Section - Uniform Grid */}
          <section className="py-10 md:py-14 lg:py-16 px-4">
            <div className="container mx-auto max-w-6xl">
              <motion.div 
                className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 lg:gap-6"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={containerVariants}
              >
                {steps.map((step, index) => (
                  <motion.div 
                    key={index} 
                    className="relative flex items-center"
                    variants={itemVariants}
                  >
                    {/* Step Card */}
                    <div 
                      onClick={() => setActiveStep(activeStep === index ? null : index)}
                      className="gentle-glow group relative w-full aspect-square max-h-[140px] md:max-h-[160px] lg:max-h-[180px] p-3 md:p-4 lg:p-5 rounded-2xl bg-card border border-primary/20 hover:border-primary/50 transition-all duration-300 text-center flex flex-col items-center justify-center cursor-pointer"
                    >
                      {/* Number Badge */}
                      <div className="absolute -top-2.5 md:-top-3 left-1/2 -translate-x-1/2 w-6 h-6 md:w-7 md:h-7 rounded-full bg-primary text-primary-foreground font-bold text-[10px] md:text-xs flex items-center justify-center shadow-lg shadow-primary/30">
                        {step.number}
                      </div>
                      
                      {/* Icon */}
                      <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 mb-2 md:mb-3">
                        {step.icon}
                      </div>
                      
                      {/* Title */}
                      <h3 className="font-semibold text-sm md:text-base lg:text-lg text-foreground mb-0.5 md:mb-1">
                        {step.title}
                      </h3>
                      
                      {/* Description */}
                      <p className="text-[10px] md:text-xs lg:text-sm text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                    
                    {/* Arrow Connector (desktop only) */}
                    {index < steps.length - 1 && (
                      <div className="hidden lg:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>

              {/* Expanded Detail Panel */}
              <AnimatePresence>
                {activeStep !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -20, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-8 overflow-hidden"
                  >
                    <div className="relative p-6 rounded-2xl bg-card border border-primary/30 shadow-lg shadow-primary/5">
                      <button
                        onClick={() => setActiveStep(null)}
                        className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                      
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                          {steps[activeStep].icon}
                        </div>
                        <div>
                          <h4 className="text-xl font-semibold text-foreground">
                            Step {steps[activeStep].number}: {steps[activeStep].title}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {steps[activeStep].description}
                          </p>
                        </div>
                      </div>
                      
                      <ul className="grid sm:grid-cols-2 gap-3">
                        {steps[activeStep].details.map((detail, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Feature Cards Section */}
          <HowItWorksFeatureCards />

          {/* CTA Section */}
          <motion.section 
            className="py-14 md:py-18 lg:py-20 px-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="container mx-auto max-w-2xl text-center space-y-4 md:space-y-6">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
                Ready to Get Started?
              </h2>
              <p className="text-base md:text-lg text-muted-foreground">
                Get your free ATS score in under 30 seconds.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center pt-2">
                <Button asChild size="lg" className="gap-2 px-6 md:px-8 py-5 md:py-6 text-sm md:text-base">
                  <Link to="/auth">
                    <Upload className="h-4 w-4 md:h-5 md:w-5" />
                    Get Started Free
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="px-6 md:px-8 py-5 md:py-6 text-sm md:text-base">
                  <Link to="/pricing">View Pricing</Link>
                </Button>
              </div>
            </div>
          </motion.section>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default HowItWorks;