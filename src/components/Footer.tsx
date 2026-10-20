import { useThemeLogo } from "@/hooks/useThemeLogo";
import { BugReportLink } from "@/components/BugReportLink";

const Footer = () => {
  const strivoLogo = useThemeLogo();
  return (
    <footer className="border-t border-border py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <img src={strivoLogo} alt="Strivo" className="h-12 w-auto" />
            <p className="text-sm text-muted-foreground">
              AI-powered resume optimization to help you land your dream job.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="hover:text-primary cursor-pointer transition-colors">Features</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Pricing</li>
              <li className="hover:text-primary cursor-pointer transition-colors">How It Works</li>
              <li className="hover:text-primary cursor-pointer transition-colors">FAQ</li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="hover:text-primary cursor-pointer transition-colors">About Us</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Blog</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Careers</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Contact</li>
            </ul>
          </div>

          {/* Legal & Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="hover:text-primary cursor-pointer transition-colors">Privacy Policy</li>
              <li><a href="https://strivoai.net/terms" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center touch-manipulation hover:text-primary cursor-pointer transition-colors">Terms of Service</a></li>
              <li><BugReportLink /></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Strivo. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
