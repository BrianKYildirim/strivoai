import { useNavigate } from "react-router-dom";
import { Rocket, Compass, Linkedin, Target, ArrowRight } from "lucide-react";

interface FeatureCardProps {
  title: string;
  description: string;
  buttonText: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant: "primary" | "secondary" | "linkedin" | "match";
}

const FeatureCard = ({ title, description, buttonText, icon, onClick, variant }: FeatureCardProps) => {
  const variantStyles = {
    primary: {
      container: "bg-secondary/40 border-primary/20 hover:border-primary/40 hover:bg-secondary/60",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
      accent: "group-hover:text-primary",
    },
    secondary: {
      container: "bg-secondary/40 border-purple-500/20 hover:border-purple-500/40 hover:bg-secondary/60",
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-400",
      accent: "group-hover:text-purple-400",
    },
    linkedin: {
      container: "bg-secondary/40 border-sky-500/20 hover:border-sky-500/40 hover:bg-secondary/60",
      iconBg: "bg-sky-500/15",
      iconColor: "text-sky-400",
      accent: "group-hover:text-sky-400",
    },
    match: {
      container: "bg-secondary/40 border-orange-500/20 hover:border-orange-500/40 hover:bg-secondary/60",
      iconBg: "bg-orange-500/15",
      iconColor: "text-orange-400",
      accent: "group-hover:text-orange-400",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`
        group relative p-5 rounded-xl border cursor-pointer
        ${styles.container}
        flex flex-col h-full min-h-[180px]
        transition-all duration-300 hover:shadow-lg hover:shadow-black/5
      `}
    >
      {/* Icon and Title Row */}
      <div className="flex items-start gap-4 mb-3">
        <div className={`w-11 h-11 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
          <div className={styles.iconColor}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-base font-semibold text-foreground mb-1 ${styles.accent} transition-colors`}>{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{description}</p>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-grow" />

      {/* Action Row */}
      <div className="flex items-center justify-between pt-3 border-t border-border/30">
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {buttonText}
        </span>
        <div
          className={`w-8 h-8 rounded-lg bg-secondary flex items-center justify-center ${styles.iconColor} group-hover:bg-secondary/80 transition-all`}
        >
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};

const FeatureCards = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: "Resume Optimizer",
      description: "Strivo AI rewrites weak bullets into achievement statements that make recruiters call you back.",
      buttonText: "Optimize Resume",
      icon: <Rocket className="w-5 h-5" />,
      onClick: () => navigate("/upload"),
      variant: "primary" as const,
    },
    {
      title: "Career Compass",
      description: "Discover exact skills and certifications needed for your dream role, with a roadmap to get there.",
      buttonText: "Map Your Path",
      icon: <Compass className="w-5 h-5" />,
      onClick: () => navigate("/career-compass"),
      variant: "secondary" as const,
    },
    {
      title: "LinkedIn Grader",
      description: "Analyze every section of your profile and learn how to rank higher in recruiter searches.",
      buttonText: "Boost Visibility",
      icon: <Linkedin className="w-5 h-5" />,
      onClick: () => navigate("/linkedin-grader"),
      variant: "linkedin" as const,
    },
    {
      title: "Recruiting Lens",
      description: "See your profile through a recruiter's eyes. Find hidden red flags and missed keywords.",
      buttonText: "Reveal Insights",
      icon: <Target className="w-5 h-5" />,
      onClick: () => navigate("/recruiting-lens"),
      variant: "match" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {features.map((feature) => (
        <FeatureCard key={feature.title} {...feature} />
      ))}
    </div>
  );
};

export default FeatureCards;
