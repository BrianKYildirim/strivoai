import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useThemeLogo } from "@/hooks/useThemeLogo";
import { Mail, Lock, Loader2, Smartphone } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type AuthMode = 'login' | 'signup' | 'otp-request' | 'otp-verify';

const Auth = () => {
  const strivoLogo = useThemeLogo();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingResume, setProcessingResume] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Countdown timer effect
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const hasPendingAnalysis = location.state?.pendingAnalysis || 
    sessionStorage.getItem('pendingResumeText');

  // Process pending resume after sign-in
  const processPendingResume = async (userId: string) => {
    const resumeText = sessionStorage.getItem('pendingResumeText');
    const fileName = sessionStorage.getItem('pendingResumeFileName') || 'resume.pdf';
    const fileSize = parseInt(sessionStorage.getItem('pendingResumeFileSize') || '0');
    const fileHash = sessionStorage.getItem('pendingResumeFileHash') || '';

    if (!resumeText) return null;

    setProcessingResume(true);

    try {
      const placeholderUrl = `analyzed-${Date.now()}`;

      const { data: resume, error: insertError } = await supabase.from('resumes').insert({
        user_id: userId,
        file_name: fileName,
        file_size: fileSize,
        file_url: placeholderUrl,
        file_path: placeholderUrl,
        file_hash: fileHash
      }).select().single();

      if (insertError || !resume) {
        console.error('Failed to save resume:', insertError);
        toast({
          title: "Error",
          description: "Failed to save resume. Please try uploading again.",
          variant: "destructive",
        });
        return null;
      }

      const { data, error } = await invokeWithTimeout<any>(
        'analyze-resume',
        { body: { resumeText, resumeId: resume.id } },
        120000,
      );

      if (error || (data && typeof data === 'object' && 'error' in data)) {
        const errorMsg = data?.error || error?.message || 'Analysis failed';
        toast({
          title: "Analysis Error",
          description: errorMsg,
          variant: "destructive",
        });
        return null;
      }

      sessionStorage.removeItem('pendingResumeText');
      sessionStorage.removeItem('pendingResumeFileName');
      sessionStorage.removeItem('pendingResumeFileSize');
      sessionStorage.removeItem('pendingResumeFileHash');

      return resume.id;
    } catch (error: any) {
      console.error('Error processing pending resume:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process resume",
        variant: "destructive",
      });
      return null;
    } finally {
      setProcessingResume(false);
    }
  };

  const checkOnboardingStatus = async (userId: string): Promise<boolean> => {
    const { data: resumes } = await supabase
      .from('resumes')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    return !!(resumes && resumes.length > 0);
  };

  useEffect(() => {
    // IMPORTANT: Set up auth listener FIRST before calling getSession
    // This ensures we catch all auth events including OAuth callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, 'Session:', !!session);
      
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        if (hasPendingAnalysis) {
          const resumeId = await processPendingResume(session.user.id);
          if (resumeId) {
            const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
            for (let i = 0; i < 3; i++) {
              setTimeout(() => {
                (window as any).confetti?.({
                  particleCount: 100,
                  spread: 70,
                  origin: { y: 0.6 },
                  colors,
                });
              }, i * 150);
            }
            toast({
              title: "Resume analyzed!",
              description: "Your results are ready.",
            });
            navigate(`/results/${resumeId}`);
          } else {
            navigate("/onboarding");
          }
        } else {
          const hasOnboarded = await checkOnboardingStatus(session.user.id);
          navigate(hasOnboarded ? "/" : "/onboarding");
        }
      }
    });

    // Fallback: Check for existing session on mount (in case we missed INITIAL_SESSION)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        if (hasPendingAnalysis) {
          processPendingResume(session.user.id).then((resumeId) => {
            if (resumeId) {
              navigate(`/results/${resumeId}`);
            } else {
              navigate("/onboarding");
            }
          });
        } else {
          const hasOnboarded = await checkOnboardingStatus(session.user.id);
          navigate(hasOnboarded ? "/" : "/onboarding");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, hasPendingAnalysis]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: "Welcome back!",
          description: "You have successfully logged in.",
        });
      } else if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        supabase.functions.invoke('send-notification-email', {
          body: { 
            eventType: 'user_welcome',
            to: email,
            data: { email, full_name: fullName }
          }
        }).catch(err => console.error('Welcome email failed:', err));

        supabase.functions.invoke('send-notification-email', {
          body: { 
            eventType: 'admin_new_signup',
            data: { email, full_name: fullName }
          }
        }).catch(err => console.error('Admin notification failed:', err));

        toast({
          title: "Account created!",
          description: "Check your email for a welcome message!",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      setAuthMode('otp-verify');
      setResendCountdown(30);
      toast({
        title: "Code sent!",
        description: "Check your email for a 6-digit verification code.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'email',
      });

      if (error) throw error;

      toast({
        title: "Welcome!",
        description: "You have successfully signed in.",
      });
    } catch (error: any) {
      toast({
        title: "Invalid code",
        description: "Please check the code and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          queryParams: { prompt: "select_account" },
        },
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (processingResume) {
    return (
      <div className="flex min-h-viewport items-start justify-center bg-background px-3 py-[max(0.75rem,env(safe-area-inset-top,0px))] sm:items-center sm:p-4">
        <Card className="w-full max-w-md space-y-6 border-border bg-card p-5 text-center sm:p-8">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <h2 className="text-xl font-semibold text-foreground">Analyzing your resume...</h2>
          <p className="text-muted-foreground">This will only take a moment.</p>
        </Card>
      </div>
    );
  }

  const isLogin = authMode === 'login';
  const isSignup = authMode === 'signup';
  const isOtpRequest = authMode === 'otp-request';
  const isOtpVerify = authMode === 'otp-verify';

  return (
    <div className="flex min-h-viewport items-start justify-center bg-background px-3 py-[max(0.75rem,env(safe-area-inset-top,0px))] sm:items-center sm:p-4">
      <Card className="relative w-full max-w-md space-y-5 border-border bg-card p-5 sm:space-y-6 sm:p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={strivoLogo} alt="Strivo" className="h-16 w-auto" />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {isOtpVerify ? "Enter Code" : isOtpRequest ? "Passwordless Sign In" : isLogin ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-muted-foreground">
            {isOtpVerify 
              ? `We sent a 6-digit code to ${email}`
              : isOtpRequest 
              ? "We'll send you a one-time code"
              : hasPendingAnalysis 
              ? "Sign in to view your resume analysis"
              : isLogin
                ? "Sign in to continue to your dashboard"
                : "Sign up to start analyzing your resume"}
          </p>
        </div>

        {/* OTP Verify Form */}
        {isOtpVerify && (
          <form onSubmit={handleOtpVerify} className="space-y-6">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={(value) => setOtpCode(value)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 py-6 text-lg"
              disabled={loading || otpCode.length !== 6}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify & Sign In"}
            </Button>

            <div className="text-center">
              {resendCountdown > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Resend code in <span className="font-semibold text-foreground">{resendCountdown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const { error } = await supabase.auth.signInWithOtp({
                        email,
                        options: {
                          shouldCreateUser: true,
                          emailRedirectTo: `${window.location.origin}/`,
                        },
                      });
                      if (error) throw error;
                      setResendCountdown(30);
                      setOtpCode("");
                      toast({
                        title: "Code resent!",
                        description: "Check your email for a new 6-digit code.",
                      });
                    } catch (error: any) {
                      toast({
                        title: "Error",
                        description: error.message,
                        variant: "destructive",
                      });
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="text-sm text-primary hover:underline"
                  disabled={loading}
                >
                  Didn't receive a code? Send again
                </button>
              )}
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setOtpCode("");
                  setResendCountdown(0);
                  setAuthMode('login');
                }}
                className="inline-flex min-h-11 items-center justify-center px-3 touch-manipulation text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to login options
              </button>
            </div>
          </form>
        )}

        {/* OTP Request Form */}
        {isOtpRequest && (
          <form onSubmit={handleOtpRequest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otpEmail">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="otpEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-primary" />
                How it works
              </div>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Enter your email address</li>
                <li>We'll send you a 6-digit code</li>
                <li>Enter the code to sign in instantly</li>
                <li>No password needed!</li>
              </ol>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 py-6 text-lg"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send Code"}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className="inline-flex min-h-11 items-center justify-center px-3 touch-manipulation text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to password login
              </button>
            </div>
          </form>
        )}

        {/* Main Auth Forms (Login/Signup) */}
        {(isLogin || isSignup) && (
          <>
            {/* Google Sign In */}
            <Button
              onClick={handleGoogleSignIn}
              variant="outline"
              className="w-full border-2 border-primary hover:bg-primary/10 py-6 text-lg"
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </Button>

            {/* OTP Option */}
            <Button
              onClick={() => setAuthMode('otp-request')}
              variant="outline"
              className="w-full border border-border hover:bg-muted py-5"
            >
              <Mail className="mr-2 h-5 w-5" />
              Sign in with Email Code (No Password)
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or with email & password
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 py-6 text-lg"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>

            {/* Toggle Login/Signup */}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                onClick={() => setAuthMode(isLogin ? 'signup' : 'login')}
                className="inline-flex min-h-11 items-center justify-center px-2 touch-manipulation text-primary hover:underline font-semibold"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </>
        )}

        {/* Back to Home */}
        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex min-h-11 items-center justify-center px-3 touch-manipulation text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to home
          </button>
        </div>
      </Card>

    </div>
  );
};

export default Auth;
