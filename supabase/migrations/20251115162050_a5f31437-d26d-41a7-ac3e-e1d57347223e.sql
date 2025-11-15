-- Fix search_path for handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id UUID;
BEGIN
  -- Create workspace for new user
  INSERT INTO public.workspaces (name, slug, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s Workspace',
    'workspace-' || SUBSTR(NEW.id::TEXT, 1, 8),
    NEW.id
  )
  RETURNING id INTO new_workspace_id;

  -- Create profile linked to workspace
  INSERT INTO public.profiles (id, workspace_id, full_name)
  VALUES (
    NEW.id,
    new_workspace_id,
    NEW.raw_user_meta_data->>'full_name'
  );

  -- Grant user role
  INSERT INTO public.user_roles (user_id, role, workspace_id, granted_by)
  VALUES (NEW.id, 'user', new_workspace_id, NEW.id);

  RETURN NEW;
END;
$$;