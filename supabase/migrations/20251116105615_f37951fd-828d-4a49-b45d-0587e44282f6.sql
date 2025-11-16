-- Add trial_end_date column to workspaces table
ALTER TABLE public.workspaces 
ADD COLUMN trial_end_date TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '14 days');

-- Update existing workspaces to have trial period
UPDATE public.workspaces 
SET trial_end_date = (created_at + INTERVAL '14 days')
WHERE trial_end_date IS NULL;