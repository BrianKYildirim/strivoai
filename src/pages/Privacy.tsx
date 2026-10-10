import { Navbar } from "@/components/Navbar";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: December 31, 2025</p>
          
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <p className="text-lg text-muted-foreground">
              Strivo AI respects your privacy. This policy explains how we collect, use, and protect your data.
            </p>

            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
              <p className="text-muted-foreground mb-2">We may collect:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Name and email</li>
                <li>Resume files and LinkedIn PDFs</li>
                <li>Job preferences and career interests</li>
                <li>Usage data (features used, credits consumed)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
              <p className="text-muted-foreground mb-2">Your data is used to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Analyze resumes and profiles</li>
                <li>Generate job fit scores and recommendations</li>
                <li>Improve product performance</li>
                <li>Provide customer support</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Data Processing & AI</h2>
              <p className="text-muted-foreground">
                Uploaded documents are processed by AI systems only to deliver Strivo features. We do not sell or share your personal data with third parties for advertising.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Data Storage & Security</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Data is stored securely using industry-standard protections.</li>
                <li>Access is limited to authorized systems.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
              <p className="text-muted-foreground">
                You may request deletion of your data at any time by contacting support.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Cookies</h2>
              <p className="text-muted-foreground">
                Strivo may use cookies for authentication and analytics.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
              <p className="text-muted-foreground mb-2">You may:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Access your data</li>
                <li>Request correction or deletion</li>
                <li>Withdraw consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Contact</h2>
              <p className="text-muted-foreground">
                For questions, contact: <a href="mailto:support@strivoai.net" className="text-primary hover:underline">support@strivoai.net</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
