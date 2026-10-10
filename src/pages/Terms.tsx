import { Navbar } from "@/components/Navbar";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Terms = () => {
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
          
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: December 31, 2025</p>
          
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <p className="text-lg text-muted-foreground">
              Welcome to Strivo AI ("Strivo", "we", "our", "us"). By accessing or using our website, platform, or services (collectively, the "Service"), you agree to be bound by these Terms of Service.
            </p>
            <p className="text-muted-foreground">If you do not agree, please do not use the Service.</p>

            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Description of Service</h2>
              <p className="text-muted-foreground mb-4">
                Strivo AI is a career intelligence and resume optimization platform that provides:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>ATS and recruiter-style resume analysis</li>
                <li>Job fit scoring and readiness evaluations</li>
                <li>Career recommendations and roadmap insights</li>
                <li>Resume optimization suggestions and rewrites</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                Strivo provides informational and analytical guidance only. We do not guarantee interviews, job offers, compensation outcomes, or employment. However, we guarantee recruiter-grade analysis, job-specific recommendations, and actionable resume feedback generated using industry-standard evaluation frameworks.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Accounts & Eligibility</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>You must be at least 15 years old to use Strivo.</li>
                <li>You are responsible for maintaining the confidentiality of your account.</li>
                <li>You agree to provide accurate and complete information.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Credits & Usage</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Strivo operates on a credit-based system.</li>
                <li>Each feature consumes a defined number of credits.</li>
                <li>Credits are non-transferable and non-refundable once used.</li>
                <li>Unused monthly credits do not roll over unless explicitly stated.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Subscriptions & Billing</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Paid plans are billed on a monthly or annual subscription basis.</li>
                <li>Subscriptions automatically renew unless cancelled before the renewal date.</li>
                <li>Prices may change with prior notice.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Refund Policy</h2>
              <p className="text-muted-foreground">
                Refunds are governed by our <Link to="/refund" className="text-primary hover:underline">Refund Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. User Content</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>You retain ownership of resumes, LinkedIn PDFs, and other content you upload.</li>
                <li>By using Strivo, you grant us a limited license to process your content solely for the purpose of providing our services.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. No Employment Guarantee</h2>
              <p className="text-muted-foreground mb-2">Strivo does not:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Represent companies or hiring managers</li>
                <li>Guarantee job placement, interviews, or earnings</li>
              </ul>
              <p className="text-muted-foreground mt-2">All insights are advisory and analytical.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Intellectual Property</h2>
              <p className="text-muted-foreground">
                All Strivo software, branding, algorithms, and content are owned by Strivo AI and may not be copied or resold without permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
              <p className="text-muted-foreground mb-2">
                To the maximum extent permitted by law, Strivo AI shall not be liable for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Employment decisions</li>
                <li>Lost opportunities or income</li>
                <li>Indirect or consequential damages</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>
              <p className="text-muted-foreground">
                We may suspend or terminate accounts that violate these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Contact</h2>
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

export default Terms;
