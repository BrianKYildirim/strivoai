import { useEffect, useState } from "react";
import strivoLogoDark from "@/assets/strivo-logo.png";
import strivoLogoLight from "@/assets/strivo-logo-light.png";

export const useThemeLogo = () => {
  const [logo, setLogo] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("light")
        ? strivoLogoLight
        : strivoLogoDark;
    }
    return strivoLogoDark;
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.classList.contains("light");
      setLogo(isLight ? strivoLogoLight : strivoLogoDark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return logo;
};
