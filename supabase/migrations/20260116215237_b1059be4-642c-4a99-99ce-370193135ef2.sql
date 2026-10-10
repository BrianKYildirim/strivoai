-- Create scheduled_emails table for queued/delayed emails
CREATE TABLE public.scheduled_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Admin can manage all emails
CREATE POLICY "Service role can manage all scheduled emails"
ON public.scheduled_emails
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for efficient processing
CREATE INDEX idx_scheduled_emails_pending ON public.scheduled_emails (scheduled_for) 
WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX idx_scheduled_emails_user ON public.scheduled_emails (user_id);

-- Function to queue welcome sequence emails after first resume analysis
CREATE OR REPLACE FUNCTION public.queue_welcome_sequence()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_name TEXT;
  existing_sequence INT;
BEGIN
  -- Only trigger on first analysis (when analyzed_at changes from NULL)
  IF OLD.analyzed_at IS NULL AND NEW.analyzed_at IS NOT NULL THEN
    -- Check if we already queued emails for this user
    SELECT COUNT(*) INTO existing_sequence 
    FROM public.scheduled_emails 
    WHERE user_id = NEW.user_id AND email_type IN ('nudge_24hr', 'career_compass_intro', 'founder_checkin');
    
    IF existing_sequence = 0 THEN
      -- Get user info
      SELECT email, full_name INTO user_email, user_name
      FROM public.profiles WHERE id = NEW.user_id;
      
      -- Queue Email 2: 24hr nudge
      INSERT INTO public.scheduled_emails (user_id, email_type, scheduled_for, metadata)
      VALUES (
        NEW.user_id, 
        'nudge_24hr', 
        NOW() + INTERVAL '24 hours',
        jsonb_build_object('email', user_email, 'name', user_name, 'resume_id', NEW.id)
      );
      
      -- Queue Email 3: Career Compass intro (48-72hr, using 60hr)
      INSERT INTO public.scheduled_emails (user_id, email_type, scheduled_for, metadata)
      VALUES (
        NEW.user_id, 
        'career_compass_intro', 
        NOW() + INTERVAL '60 hours',
        jsonb_build_object('email', user_email, 'name', user_name)
      );
      
      -- Queue Email 5: Founder check-in (5-7 days, using 6 days)
      INSERT INTO public.scheduled_emails (user_id, email_type, scheduled_for, metadata)
      VALUES (
        NEW.user_id, 
        'founder_checkin', 
        NOW() + INTERVAL '6 days',
        jsonb_build_object('email', user_email, 'name', user_name)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER trigger_queue_welcome_sequence
AFTER UPDATE ON public.resumes
FOR EACH ROW
EXECUTE FUNCTION public.queue_welcome_sequence();

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;