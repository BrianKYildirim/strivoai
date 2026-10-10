import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Bug } from 'lucide-react';

export const BugReportLink = () => {
  const location = useLocation();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  const generateMailto = () => {
    const subject = encodeURIComponent('Bug Report - Strivo');
    const body = encodeURIComponent(
      `Hi Strivo Team,\n\n` +
      `I encountered an issue and wanted to report it.\n\n` +
      `---\n` +
      `Route: ${location.pathname}\n` +
      `User ID: ${userId || 'Not logged in'}\n` +
      `Timestamp: ${new Date().toISOString()}\n` +
      `---\n\n` +
      `Description of the issue:\n\n`
    );
    return `mailto:support@strivo.app?subject=${subject}&body=${body}`;
  };

  return (
    <a 
      href={generateMailto()}
      // UI-SPEC F4 (XD-11): 44px hit area; the label and icon are unchanged.
      className="inline-flex min-h-11 items-center gap-1.5 touch-manipulation text-sm text-muted-foreground hover:text-primary transition-colors"
    >
      <Bug className="h-4 w-4" />
      Report a Bug
    </a>
  );
};
