-- Drop the incorrect trigger and function
DROP TRIGGER IF EXISTS grant_admin_after_signup ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_admin_to_email();

-- Create corrected function that queries auth.users for email
CREATE OR REPLACE FUNCTION public.grant_admin_to_specific_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get the user's email from auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.id;
  
  -- Check if the user's email is james@jaimar.dev
  IF user_email = 'james@jaimar.dev' THEN
    -- Grant admin role (in addition to the 'user' role created by handle_new_user)
    INSERT INTO public.user_roles (user_id, role, workspace_id, granted_by)
    VALUES (NEW.id, 'admin'::app_role, NEW.workspace_id, NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger on profiles table
CREATE TRIGGER grant_admin_after_profile_creation
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_admin_to_specific_email();