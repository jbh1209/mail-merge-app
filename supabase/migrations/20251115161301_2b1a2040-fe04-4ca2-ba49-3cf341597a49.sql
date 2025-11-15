-- Function to auto-grant admin role to specific email
CREATE OR REPLACE FUNCTION public.grant_admin_to_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user's email is james@jaimar.dev
  IF NEW.email = 'james@jaimar.dev' THEN
    -- Grant admin role (in addition to the 'user' role created by handle_new_user)
    INSERT INTO public.user_roles (user_id, role, workspace_id, granted_by)
    SELECT NEW.id, 'admin'::app_role, workspace_id, NEW.id
    FROM public.profiles
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-grant admin after profile is created
CREATE TRIGGER grant_admin_after_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_admin_to_email();