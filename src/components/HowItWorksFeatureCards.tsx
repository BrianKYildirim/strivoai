import { useNavigate } from "react-router-dom";
import { Rocket, Compass, Linkedin, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeatureCardProps {
  title: string;
  description: string;
  buttonText: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant: "primary" | "secondary" | "linkedin" | "match";
}

const FeatureCard = ({
  title,
  description,
  buttonText,
  icon,
  onClick,
  variant,
}: FeatureCardProps) => {
  const variantStyles = {
    primary: {
      container: "bg-card border-primary/30 hover:border-primary/50",
      iconBg: "bg-primary/20",
      iconColor: "text-primary",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground",
      glow: "hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)]",
    },
    secondary: {
      container: "bg-card border-purple-500/30 hover:border-purple-500/50",
      iconBg: "bg-purple-500/20",
      iconColor: "text-purple-400",
      button: "bg-secondary hover:bg-secondary/80 text-foreground border border-border",
      glow: "hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.4)]",
    },
    linkedin: {
      container: "bg-card border-sky-500/30 hover:border-sky-500/50",
      iconBg: "bg-sky-500/20",
      iconColor: "text-sky-400",
      button: "bg-secondary hover:bg-secondary/80 text-foreground border border-border",
      glow: "hover:shadow-[0_0_30px_-5px_rgba(14,165,233,0.4)]",
    },
    match: {
      container: "bg-card border-orange-500/30 hover:border-orange-500/50",
      iconBg: "bg-orange-500/20",
      iconColor: "text-orange-400",
      button: "bg-secondary hover:bg-secondary/80 text-foreground border border-border",
      glow: "hover:shadow-[0_0_30px_-5px_rgba(249,115,22,0.4)]",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={`
        group relative p-6 md:p-8 rounded-2xl border
        ${styles.container} ${styles.glow}
        flex flex-col h-full min-h-[260px] md:min-h-[280px]
        transition-all duration-300
      `}
    >
      {/* Icon */}
      <div className={`w-14 h-14 rounded-xl ${styles.iconBg} flex items-center justify-center mb-6`}>
        <div className={styles.iconColor}>{icon}</div>
      </div>

      {/* Content */}
      <h3 className="text-xl md:text-2xl font-bold text-foreground mb-3">
        {title}
      </h3>
      <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-6 flex-grow">
        {description}
      </p>

      {/* Button */}
      <Button
        onClick={onClick}
        className={`w-full py-5 md:py-6 text-sm md:text-base font-medium rounded-xl ${styles.button}`}
      >
        {buttonText}
      </Button>
    </div>
  );
};

const HowItWorksFeatureCards = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: "Resume Optimizer",
      description: "Stop getting ghosted. Our AI rewrites weak bullets into achievement-driven statements that make recruiters stop scrolling and start calling.",
      buttonText: "Optimize Resume",
      icon: <Rocket className="w-7 h-7" />,
      onClick: () => navigate("/upload"),
      variant: "primary" as const,
    },
    {
      title: "Career Compass",
      description: "Your skills already point to a set of careers. We identify the best ones based on your resume and LinkedIn—and help you move into them efficiently.",
      buttonText: "Map Your Path",
      icon: <Compass className="w-7 h-7" />,
      onClick: () => navigate("/career-compass"),
      variant: "secondary" as const,
    },
    {
      title: "LinkedIn Grader",
      description: "Analyze every section of your profile and learn how to rank higher in recruiter searches with actionable optimization tips.",
      buttonText: "Boost Visibility",
      icon: <Linkedin className="w-7 h-7" />,
      onClick: () => navigate("/linkedin-grader"),
      variant: "linkedin" as const,
    },
    {
      title: "Recruiting Lens",
      description: "Paste any job description. Get a roadmap to close the gap plus ready-to-paste rewrites tailored for that specific role.",
      buttonText: "Reveal Insights",
      icon: <Target className="w-7 h-7" />,
      onClick: () => navigate("/recruiting-lens"),
      variant: "match" as const,
    },
  ];

  return (
    <section className="py-16 md:py-20 lg:py-24 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="text-center mb-10 md:mb-14 lg:mb-16 space-y-3 md:space-y-4">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            What You <span className="text-primary">Get</span>
          </h2>
          <p className="text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto">
            Four powerful tools designed to accelerate your job search and land interviews faster.
          </p>
        </div>

        {/* 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksFeatureCards;