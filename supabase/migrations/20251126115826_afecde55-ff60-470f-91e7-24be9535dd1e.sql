
-- Add subscription_tier to profiles table
ALTER TABLE public.profiles 
ADD COLUMN subscription_tier text NOT NULL DEFAULT 'free' 
CHECK (subscription_tier IN ('free', 'premium', 'pro'));

-- Create index for faster subscription tier queries
CREATE INDEX idx_profiles_subscription_tier ON public.profiles(subscription_tier);

-- Update existing profiles to have free tier
UPDATE public.profiles SET subscription_tier = 'free' WHERE subscription_tier IS NULL;
