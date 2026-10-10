import { Navbar } from "@/components/Navbar";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Refund = () => {
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
          
          <h1 className="text-4xl font-bold mb-2">Refund Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 2026</p>
          
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <p className="text-muted-foreground">
              Strivo AI handles refund requests through Strivo support and the
              payment processor used for your purchase.
            </p>

            <section>
              <h2 className="text-2xl font-semibold mb-4">Consumer Right to Cancel</h2>
              <p className="text-muted-foreground">
                If you are a consumer, you have the right to cancel your purchase within 14 days of purchase without providing a reason, in accordance with applicable consumer protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">Digital Services</h2>
              <p className="text-muted-foreground mb-4">
                Strivo AI provides digital services that may be made available immediately after purchase.
              </p>
              <p className="text-muted-foreground">
                If you request a refund within the 14-day cancellation period,
                Strivo support will review the request in accordance with
                applicable consumer protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">Refund Processing</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Refund requests are handled through Strivo support</li>
                <li>Approved refunds are returned using the original payment method</li>
                <li>Processing may take up to 14 days</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">How to Request a Refund</h2>
              <p className="text-muted-foreground mb-4">
                To request a refund, please contact:
              </p>
              <p className="text-muted-foreground mb-4">
                <a href="mailto:support@strivoai.net" className="text-primary hover:underline">support@strivoai.net</a>
              </p>
              <p className="text-muted-foreground">
                Please include the email address on your account and any
                relevant order or payment details so support can locate the
                purchase.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Refund;
