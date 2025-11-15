-- =====================================================
-- MAIL-MERGE.APP DATABASE SCHEMA
-- Complete multi-tenant SaaS + SEO engine foundation
-- =====================================================

-- =====================================================
-- 1. CREATE ENUMS
-- =====================================================

CREATE TYPE app_role AS ENUM ('admin', 'user');
CREATE TYPE project_type AS ENUM ('label', 'certificate', 'card', 'shelf_strip', 'badge', 'custom');
CREATE TYPE project_status AS ENUM ('draft', 'mapping', 'ready', 'generating', 'complete', 'error');
CREATE TYPE data_source_type AS ENUM ('csv', 'excel', 'google_sheet', 'manual');
CREATE TYPE template_type AS ENUM ('uploaded_pdf', 'uploaded_image', 'built_in_library', 'ai_generated');
CREATE TYPE job_status AS ENUM ('queued', 'processing', 'complete', 'error');
CREATE TYPE subscription_tier AS ENUM ('starter', 'pro', 'business');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing');
CREATE TYPE seo_page_type AS ENUM ('template', 'how_to', 'comparison', 'industry', 'use_case', 'avery_label');

-- =====================================================
-- 2. CREATE TABLES - AUTHENTICATION & USERS
-- =====================================================

-- Workspaces (tenant/organization)
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subscription_tier subscription_tier DEFAULT 'starter' NOT NULL,
  subscription_status subscription_status DEFAULT 'trialing' NOT NULL,
  pages_used_this_month INTEGER DEFAULT 0 NOT NULL,
  pages_quota INTEGER DEFAULT 100 NOT NULL,
  billing_cycle_start DATE DEFAULT CURRENT_DATE NOT NULL,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles (one-to-one with auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- User roles (separate for security - CRITICAL)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, workspace_id, role)
);

-- =====================================================
-- 3. SAAS APPLICATION - PROJECTS & DATA
-- =====================================================

-- Projects (each mail merge project)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  project_type project_type NOT NULL,
  status project_status DEFAULT 'draft' NOT NULL,
  ai_suggestions JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Data sources (uploaded data files)
CREATE TABLE public.data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  source_type data_source_type NOT NULL,
  file_url TEXT,
  google_sheet_url TEXT,
  row_count INTEGER DEFAULT 0 NOT NULL,
  parsed_fields JSONB,
  ai_field_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Templates (design templates)
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type template_type NOT NULL,
  file_url TEXT,
  preview_url TEXT,
  width_mm NUMERIC,
  height_mm NUMERIC,
  bleed_mm NUMERIC DEFAULT 3,
  design_config JSONB,
  ai_layout_suggestions JSONB,
  is_public BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Field mappings (data columns → template placeholders)
CREATE TABLE public.field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  data_source_id UUID REFERENCES public.data_sources(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE NOT NULL,
  mappings JSONB,
  ai_confidence_score NUMERIC,
  user_confirmed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Merge jobs (PDF generation queue)
CREATE TABLE public.merge_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  data_source_id UUID REFERENCES public.data_sources(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE NOT NULL,
  status job_status DEFAULT 'queued' NOT NULL,
  total_pages INTEGER NOT NULL,
  processed_pages INTEGER DEFAULT 0 NOT NULL,
  output_url TEXT,
  error_message TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Generated outputs (final PDFs)
CREATE TABLE public.generated_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  merge_job_id UUID REFERENCES public.merge_jobs(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  page_count INTEGER NOT NULL,
  download_count INTEGER DEFAULT 0 NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Usage logs (billing tracking)
CREATE TABLE public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  merge_job_id UUID REFERENCES public.merge_jobs(id),
  pages_generated INTEGER NOT NULL,
  billed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  billing_cycle_month TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================
-- 4. SEO ENGINE - PROGRAMMATIC PAGES
-- =====================================================

-- SEO pages (all SEO landing pages)
CREATE TABLE public.seo_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  page_type seo_page_type NOT NULL,
  title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  h1 TEXT NOT NULL,
  hero_summary TEXT,
  content_blocks JSONB,
  schema_markup JSONB,
  target_keyword TEXT,
  is_published BOOLEAN DEFAULT false NOT NULL,
  published_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- SEO templates (page templates for different types)
CREATE TABLE public.seo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  page_type seo_page_type NOT NULL,
  fields_schema JSONB,
  default_content_blocks JSONB,
  schema_template JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- SEO internal links (linking strategy)
CREATE TABLE public.seo_internal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_page_id UUID REFERENCES public.seo_pages(id) ON DELETE CASCADE NOT NULL,
  target_page_id UUID REFERENCES public.seo_pages(id) ON DELETE CASCADE NOT NULL,
  anchor_text TEXT NOT NULL,
  relevance_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Keywords (keyword research & tracking)
CREATE TABLE public.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT UNIQUE NOT NULL,
  search_volume INTEGER,
  difficulty NUMERIC,
  assigned_page_id UUID REFERENCES public.seo_pages(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'researched' NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================
-- 5. BILLING & SUBSCRIPTIONS
-- =====================================================

-- Subscription tiers (plan definitions)
CREATE TABLE public.subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name subscription_tier UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  pages_per_month INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id TEXT,
  features JSONB,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Stripe subscriptions (Stripe webhook data)
CREATE TABLE public.stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merge_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_internal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. SECURITY DEFINER FUNCTIONS (avoid recursive RLS)
-- =====================================================

-- Get user's workspace_id
CREATE OR REPLACE FUNCTION public.get_user_workspace_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = _user_id;
$$;

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- =====================================================
-- 8. RLS POLICIES
-- =====================================================

-- Workspaces: users can only see their own workspace
CREATE POLICY "Users can view their own workspace"
  ON public.workspaces FOR SELECT
  USING (owner_id = auth.uid() OR id IN (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update their own workspace"
  ON public.workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- Profiles: users can view all profiles in their workspace
CREATE POLICY "Users can view profiles in their workspace"
  ON public.profiles FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- User roles: users can view roles in their workspace
CREATE POLICY "Users can view roles in their workspace"
  ON public.user_roles FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Projects: workspace scoped
CREATE POLICY "Users can view projects in their workspace"
  ON public.projects FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can create projects in their workspace"
  ON public.projects FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can update projects in their workspace"
  ON public.projects FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can delete projects in their workspace"
  ON public.projects FOR DELETE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

-- Data sources: workspace scoped
CREATE POLICY "Users can view data sources in their workspace"
  ON public.data_sources FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can create data sources in their workspace"
  ON public.data_sources FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can update data sources in their workspace"
  ON public.data_sources FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can delete data sources in their workspace"
  ON public.data_sources FOR DELETE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

-- Templates: public templates viewable by all, private templates workspace scoped
CREATE POLICY "Users can view public templates or templates in their workspace"
  ON public.templates FOR SELECT
  USING (is_public = true OR workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can create templates in their workspace"
  ON public.templates FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id(auth.uid()) OR workspace_id IS NULL);

CREATE POLICY "Users can update templates in their workspace"
  ON public.templates FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can delete templates in their workspace"
  ON public.templates FOR DELETE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

-- Field mappings: workspace scoped through project
CREATE POLICY "Users can view field mappings for their workspace projects"
  ON public.field_mappings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = field_mappings.project_id
    AND projects.workspace_id = public.get_user_workspace_id(auth.uid())
  ));

CREATE POLICY "Users can create field mappings for their workspace projects"
  ON public.field_mappings FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = field_mappings.project_id
    AND projects.workspace_id = public.get_user_workspace_id(auth.uid())
  ));

CREATE POLICY "Users can update field mappings for their workspace projects"
  ON public.field_mappings FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = field_mappings.project_id
    AND projects.workspace_id = public.get_user_workspace_id(auth.uid())
  ));

CREATE POLICY "Users can delete field mappings for their workspace projects"
  ON public.field_mappings FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = field_mappings.project_id
    AND projects.workspace_id = public.get_user_workspace_id(auth.uid())
  ));

-- Merge jobs: workspace scoped
CREATE POLICY "Users can view merge jobs in their workspace"
  ON public.merge_jobs FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can create merge jobs in their workspace"
  ON public.merge_jobs FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can update merge jobs in their workspace"
  ON public.merge_jobs FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

-- Generated outputs: workspace scoped
CREATE POLICY "Users can view generated outputs in their workspace"
  ON public.generated_outputs FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can create generated outputs in their workspace"
  ON public.generated_outputs FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "Users can update generated outputs in their workspace"
  ON public.generated_outputs FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

-- Usage logs: workspace scoped
CREATE POLICY "Users can view usage logs in their workspace"
  ON public.usage_logs FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "System can create usage logs"
  ON public.usage_logs FOR INSERT
  WITH CHECK (true);

-- SEO pages: admin only
CREATE POLICY "Admins can manage SEO pages"
  ON public.seo_pages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view published SEO pages"
  ON public.seo_pages FOR SELECT
  USING (is_published = true OR public.has_role(auth.uid(), 'admin'));

-- SEO templates: admin only
CREATE POLICY "Admins can manage SEO templates"
  ON public.seo_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- SEO internal links: admin only
CREATE POLICY "Admins can manage SEO internal links"
  ON public.seo_internal_links FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Keywords: admin only
CREATE POLICY "Admins can manage keywords"
  ON public.keywords FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Subscription tiers: everyone can read
CREATE POLICY "Everyone can view active subscription tiers"
  ON public.subscription_tiers FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage subscription tiers"
  ON public.subscription_tiers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Stripe subscriptions: workspace scoped
CREATE POLICY "Users can view their workspace subscription"
  ON public.stripe_subscriptions FOR SELECT
  USING (workspace_id = public.get_user_workspace_id(auth.uid()));

CREATE POLICY "System can manage stripe subscriptions"
  ON public.stripe_subscriptions FOR ALL
  USING (true);

-- =====================================================
-- 9. TRIGGERS & FUNCTIONS
-- =====================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_field_mappings_updated_at
  BEFORE UPDATE ON public.field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stripe_subscriptions_updated_at
  BEFORE UPDATE ON public.stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 10. STORAGE BUCKETS
-- =====================================================

-- User uploads (private per workspace)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Templates (public for library, private for user templates)
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

-- Generated PDFs (private per workspace)
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-pdfs', 'generated-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- SEO assets (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('seo-assets', 'seo-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for user-uploads
CREATE POLICY "Users can upload files to their workspace folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-uploads' AND
    (storage.foldername(name))[1] = public.get_user_workspace_id(auth.uid())::TEXT
  );

CREATE POLICY "Users can view files in their workspace folder"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-uploads' AND
    (storage.foldername(name))[1] = public.get_user_workspace_id(auth.uid())::TEXT
  );

CREATE POLICY "Users can delete files in their workspace folder"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-uploads' AND
    (storage.foldername(name))[1] = public.get_user_workspace_id(auth.uid())::TEXT
  );

-- Storage RLS Policies for templates
CREATE POLICY "Everyone can view public templates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'templates');

CREATE POLICY "Users can upload templates to their workspace folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'templates' AND
    (storage.foldername(name))[1] = public.get_user_workspace_id(auth.uid())::TEXT
  );

CREATE POLICY "Users can delete templates in their workspace folder"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'templates' AND
    (storage.foldername(name))[1] = public.get_user_workspace_id(auth.uid())::TEXT
  );

-- Storage RLS Policies for generated-pdfs
CREATE POLICY "Users can view generated PDFs in their workspace"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'generated-pdfs' AND
    (storage.foldername(name))[1] = public.get_user_workspace_id(auth.uid())::TEXT
  );

CREATE POLICY "System can create generated PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-pdfs');

-- Storage RLS Policies for seo-assets
CREATE POLICY "Everyone can view SEO assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'seo-assets');

CREATE POLICY "Admins can upload SEO assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'seo-assets' AND
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete SEO assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'seo-assets' AND
    public.has_role(auth.uid(), 'admin')
  );

-- =====================================================
-- 11. SEED DATA - SUBSCRIPTION TIERS
-- =====================================================

INSERT INTO public.subscription_tiers (tier_name, display_name, pages_per_month, price_cents, features) VALUES
  ('starter', 'Starter Plan', 100, 0, '["100 pages/month", "CSV upload", "Basic templates", "Email support"]'::jsonb),
  ('pro', 'Professional Plan', 1000, 2900, '["1,000 pages/month", "All file types", "AI mapping", "Priority support", "Custom templates"]'::jsonb),
  ('business', 'Business Plan', 10000, 9900, '["10,000 pages/month", "All features", "API access", "Dedicated support", "White-label", "Custom integrations"]'::jsonb)
ON CONFLICT (tier_name) DO NOTHING;