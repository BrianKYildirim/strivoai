import { useState, useEffect } from "react";

const SESSION_KEY = "strivo_intro_shown";

export const useIntroAnimation = () => {
  const [showIntro, setShowIntro] = useState<boolean | null>(null);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    // Check if intro was already shown this session
    const hasShownIntro = sessionStorage.getItem(SESSION_KEY);
    
    if (hasShownIntro) {
      setShowIntro(false);
      setIntroComplete(true);
    } else {
      setShowIntro(true);
    }
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setShowIntro(false);
    setIntroComplete(true);
  };

  return {
    showIntro,
    introComplete,
    handleIntroComplete,
  };
};
