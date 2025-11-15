# Database Documentation

**Last Updated:** 2025-11-15  
**Version:** 1.0  
**Status:** ✅ Schema Complete

## Overview

The database uses PostgreSQL 15+ with Row-Level Security (RLS) enabled on all tables. Multi-tenancy is achieved through workspace-based data isolation.

## Database Schema

### Entity Relationship Summary

```
workspaces (1) ──→ (many) profiles
workspaces (1) ──→ (many) projects
workspaces (1) ──→ (many) data_sources
workspaces (1) ──→ (many) templates
workspaces (1) ──→ (many) merge_jobs
workspaces (1) ──→ (many) generated_outputs
workspaces (1) ──→ (many) usage_logs
workspaces (1) ──→ (1) stripe_subscriptions
workspaces (1) ──→ (many) user_roles

projects (1) ──→ (many) data_sources
projects (1) ──→ (many) templates
projects (1) ──→ (many) field_mappings

data_sources (1) ──→ (many) merge_jobs
templates (1) ──→ (many) merge_jobs
merge_jobs (1) ──→ (many) generated_outputs

seo_pages (1) ──→ (many) seo_internal_links (as source)
seo_pages (1) ──→ (many) seo_internal_links (as target)
seo_pages (many) ──→ (1) keywords
```

---

## Tables

### 1. workspaces

**Purpose**: Top-level tenant entity for multi-tenant isolation

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| name | text | No | - | Workspace display name |
| slug | text | No | - | URL-safe identifier |
| owner_id | uuid | No | - | References auth.users |
| subscription_tier | subscription_tier | No | 'starter' | Current subscription level |
| subscription_status | subscription_status | No | 'trialing' | Billing status |
| pages_quota | integer | No | 100 | Monthly page limit |
| pages_used_this_month | integer | No | 0 | Current month usage |
| billing_cycle_start | date | No | CURRENT_DATE | When current cycle began |
| stripe_customer_id | text | Yes | - | Stripe customer reference |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Unique constraint on `slug`
- Unique constraint on `owner_id`

**RLS Policies:**
- `Users can view their own workspace`: SELECT where owner_id = auth.uid() OR id IN (user's workspace from profiles)
- `Users can update their own workspace`: UPDATE where owner_id = auth.uid()

---

### 2. profiles

**Purpose**: Extended user information beyond auth.users

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | - | References auth.users(id) |
| workspace_id | uuid | Yes | - | References workspaces(id) |
| full_name | text | Yes | - | User's display name |
| avatar_url | text | Yes | - | Profile picture URL |
| onboarding_completed | boolean | No | false | Whether user finished setup |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`

**RLS Policies:**
- `Users can view profiles in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can insert their own profile`: INSERT where id = auth.uid()
- `Users can update their own profile`: UPDATE where id = auth.uid()

**Triggers:**
- `update_profiles_updated_at`: BEFORE UPDATE, calls update_updated_at_column()
- `grant_admin_after_profile_creation`: AFTER INSERT, calls grant_admin_to_specific_email()

---

### 3. user_roles

**Purpose**: Role-based access control (RBAC)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| user_id | uuid | No | - | References auth.users |
| role | app_role | No | - | Role: 'admin', 'moderator', 'user' |
| workspace_id | uuid | No | - | References workspaces |
| granted_by | uuid | Yes | - | User who granted this role |
| granted_at | timestamptz | No | now() | When role was assigned |

**Indexes:**
- Primary key on `id`
- Unique constraint on `(user_id, role, workspace_id)`

**RLS Policies:**
- `Users can view roles in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `Admins can manage roles`: ALL where has_role(auth.uid(), 'admin')

---

### 4. projects

**Purpose**: Organize mail merge or SEO projects within workspaces

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | No | - | References workspaces |
| name | text | No | - | Project name |
| description | text | Yes | - | Project description |
| project_type | project_type | No | - | 'mail_merge' or 'seo' |
| status | project_status | No | 'draft' | Current state |
| created_by | uuid | No | - | References auth.users |
| ai_suggestions | jsonb | Yes | - | AI-generated recommendations |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`

**RLS Policies:**
- `Users can view projects in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can create projects in their workspace`: INSERT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can update projects in their workspace`: UPDATE where workspace_id = get_user_workspace_id(auth.uid())
- `Users can delete projects in their workspace`: DELETE where workspace_id = get_user_workspace_id(auth.uid())

**Triggers:**
- `update_projects_updated_at`: BEFORE UPDATE, calls update_updated_at_column()

---

### 5. data_sources

**Purpose**: Store uploaded data files (CSV, Excel, Google Sheets)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | No | - | References workspaces |
| project_id | uuid | No | - | References projects |
| source_type | data_source_type | No | - | 'csv', 'excel', 'google_sheets' |
| file_url | text | Yes | - | Storage path for uploaded file |
| google_sheet_url | text | Yes | - | URL for Google Sheets integration |
| row_count | integer | No | 0 | Number of data rows |
| parsed_fields | jsonb | Yes | - | Detected column structure |
| ai_field_analysis | jsonb | Yes | - | AI analysis of field types |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`
- Foreign key on `project_id`

**RLS Policies:**
- `Users can view data sources in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can create data sources in their workspace`: INSERT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can update data sources in their workspace`: UPDATE where workspace_id = get_user_workspace_id(auth.uid())
- `Users can delete data sources in their workspace`: DELETE where workspace_id = get_user_workspace_id(auth.uid())

**Triggers:**
- `update_data_sources_updated_at`: BEFORE UPDATE, calls update_updated_at_column()

---

### 6. templates

**Purpose**: Store PDF templates for mail merge

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | Yes | - | References workspaces (null = public) |
| project_id | uuid | Yes | - | References projects |
| name | text | No | - | Template name |
| template_type | template_type | No | - | 'certificate', 'invoice', etc. |
| file_url | text | Yes | - | Storage path for PDF |
| preview_url | text | Yes | - | Thumbnail preview image |
| width_mm | numeric | Yes | - | Page width in millimeters |
| height_mm | numeric | Yes | - | Page height in millimeters |
| bleed_mm | numeric | Yes | 3 | Bleed margin in millimeters |
| design_config | jsonb | Yes | - | Layout configuration |
| ai_layout_suggestions | jsonb | Yes | - | AI-detected fields |
| is_public | boolean | No | false | Available to all users |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`
- Foreign key on `project_id`

**RLS Policies:**
- `Users can view public templates or templates in their workspace`: SELECT where is_public = true OR workspace_id = get_user_workspace_id(auth.uid())
- `Users can create templates in their workspace`: INSERT where workspace_id = get_user_workspace_id(auth.uid()) OR workspace_id IS NULL
- `Users can update templates in their workspace`: UPDATE where workspace_id = get_user_workspace_id(auth.uid())
- `Users can delete templates in their workspace`: DELETE where workspace_id = get_user_workspace_id(auth.uid())

**Triggers:**
- `update_templates_updated_at`: BEFORE UPDATE, calls update_updated_at_column()

---

### 7. field_mappings

**Purpose**: Store mapping between data columns and template fields

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| project_id | uuid | No | - | References projects |
| data_source_id | uuid | No | - | References data_sources |
| template_id | uuid | No | - | References templates |
| mappings | jsonb | Yes | - | JSON of column → field mappings |
| ai_confidence_score | numeric | Yes | - | AI confidence (0-1) |
| user_confirmed | boolean | No | false | User verified mapping |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Foreign key on `project_id`
- Foreign key on `data_source_id`
- Foreign key on `template_id`

**RLS Policies:**
- `Users can view field mappings for their workspace projects`: SELECT where project belongs to user's workspace
- `Users can create field mappings for their workspace projects`: INSERT where project belongs to user's workspace
- `Users can update field mappings for their workspace projects`: UPDATE where project belongs to user's workspace
- `Users can delete field mappings for their workspace projects`: DELETE where project belongs to user's workspace

**Triggers:**
- `update_field_mappings_updated_at`: BEFORE UPDATE, calls update_updated_at_column()

---

### 8. merge_jobs

**Purpose**: Track PDF generation job status

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | No | - | References workspaces |
| project_id | uuid | No | - | References projects |
| data_source_id | uuid | No | - | References data_sources |
| template_id | uuid | No | - | References templates |
| status | job_status | No | 'queued' | 'queued', 'processing', 'completed', 'failed' |
| total_pages | integer | No | - | Total PDFs to generate |
| processed_pages | integer | No | 0 | PDFs generated so far |
| output_url | text | Yes | - | Bulk download URL |
| error_message | text | Yes | - | Error details if failed |
| processing_started_at | timestamptz | Yes | - | When job started |
| processing_completed_at | timestamptz | Yes | - | When job finished |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`
- Index on `status`

**RLS Policies:**
- `Users can view merge jobs in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can create merge jobs in their workspace`: INSERT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can update merge jobs in their workspace`: UPDATE where workspace_id = get_user_workspace_id(auth.uid())

---

### 9. generated_outputs

**Purpose**: Track individual generated PDF files

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | No | - | References workspaces |
| merge_job_id | uuid | No | - | References merge_jobs |
| file_url | text | No | - | Storage path for PDF |
| file_size_bytes | bigint | No | - | File size |
| page_count | integer | No | - | Number of pages in PDF |
| download_count | integer | No | 0 | Times downloaded |
| expires_at | timestamptz | Yes | - | Auto-deletion date |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`
- Foreign key on `merge_job_id`
- Index on `expires_at`

**RLS Policies:**
- `Users can view generated outputs in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can create generated outputs in their workspace`: INSERT where workspace_id = get_user_workspace_id(auth.uid())
- `Users can update generated outputs in their workspace`: UPDATE where workspace_id = get_user_workspace_id(auth.uid())

---

### 10. usage_logs

**Purpose**: Track page generation for billing

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | No | - | References workspaces |
| user_id | uuid | No | - | References auth.users |
| merge_job_id | uuid | Yes | - | References merge_jobs |
| pages_generated | integer | No | - | Number of pages |
| billing_cycle_month | text | No | - | YYYY-MM format |
| billed_at | timestamptz | No | now() | When usage recorded |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`
- Foreign key on `workspace_id`
- Index on `(workspace_id, billing_cycle_month)`

**RLS Policies:**
- `Users can view usage logs in their workspace`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `System can create usage logs`: INSERT where true (service role only)

---

### 11. subscription_tiers

**Purpose**: Define available subscription plans

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| tier_name | subscription_tier | No | - | 'starter', 'professional', etc. |
| display_name | text | No | - | User-facing name |
| price_cents | integer | No | - | Monthly price in cents |
| pages_per_month | integer | No | - | Monthly page quota |
| features | jsonb | Yes | - | Feature flags JSON |
| stripe_price_id | text | Yes | - | Stripe price ID |
| is_active | boolean | No | true | Currently offered |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`
- Unique constraint on `tier_name`

**RLS Policies:**
- `Everyone can view active subscription tiers`: SELECT where is_active = true
- `Admins can manage subscription tiers`: ALL where has_role(auth.uid(), 'admin')

---

### 12. stripe_subscriptions

**Purpose**: Link workspaces to Stripe subscriptions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| workspace_id | uuid | No | - | References workspaces |
| stripe_customer_id | text | No | - | Stripe customer ID |
| stripe_subscription_id | text | No | - | Stripe subscription ID |
| status | text | No | - | Stripe subscription status |
| current_period_start | timestamptz | No | - | Billing period start |
| current_period_end | timestamptz | No | - | Billing period end |
| cancel_at_period_end | boolean | No | false | Will cancel at end |
| created_at | timestamptz | No | now() | Record creation time |
| updated_at | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Unique constraint on `workspace_id`
- Unique constraint on `stripe_subscription_id`

**RLS Policies:**
- `Users can view their workspace subscription`: SELECT where workspace_id = get_user_workspace_id(auth.uid())
- `System can manage stripe subscriptions`: ALL where true (service role only)

**Triggers:**
- `update_stripe_subscriptions_updated_at`: BEFORE UPDATE, calls update_updated_at_column()

---

### 13. seo_pages

**Purpose**: Store SEO-optimized content pages

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| slug | text | No | - | URL path (unique) |
| title | text | No | - | Page title |
| meta_description | text | No | - | SEO meta description |
| h1 | text | No | - | Main heading |
| hero_summary | text | Yes | - | Above-fold summary |
| target_keyword | text | Yes | - | Primary keyword |
| page_type | seo_page_type | No | - | 'service', 'location', etc. |
| content_blocks | jsonb | Yes | - | Structured content |
| schema_markup | jsonb | Yes | - | JSON-LD structured data |
| is_published | boolean | No | false | Visible to public |
| published_at | timestamptz | Yes | - | When published |
| created_at | timestamptz | No | now() | Record creation time |
| last_updated | timestamptz | No | now() | Last update time |

**Indexes:**
- Primary key on `id`
- Unique constraint on `slug`
- Index on `is_published`

**RLS Policies:**
- `Everyone can view published SEO pages`: SELECT where is_published = true OR has_role(auth.uid(), 'admin')
- `Admins can manage SEO pages`: ALL where has_role(auth.uid(), 'admin')

---

### 14. seo_templates

**Purpose**: Define templates for SEO page types

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| name | text | No | - | Template name |
| page_type | seo_page_type | No | - | Page type this applies to |
| fields_schema | jsonb | Yes | - | Required fields definition |
| default_content_blocks | jsonb | Yes | - | Default content structure |
| schema_template | jsonb | Yes | - | JSON-LD template |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`

**RLS Policies:**
- `Admins can manage SEO templates`: ALL where has_role(auth.uid(), 'admin')

---

### 15. keywords

**Purpose**: Keyword research and assignment

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| keyword | text | No | - | Keyword phrase |
| search_volume | integer | Yes | - | Monthly search volume |
| difficulty | numeric | Yes | - | Competition score (0-100) |
| status | text | No | 'researched' | 'researched', 'assigned', 'published' |
| assigned_page_id | uuid | Yes | - | References seo_pages |
| notes | text | Yes | - | Internal notes |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`
- Unique constraint on `keyword`
- Foreign key on `assigned_page_id`

**RLS Policies:**
- `Admins can manage keywords`: ALL where has_role(auth.uid(), 'admin')

---

### 16. seo_internal_links

**Purpose**: Track internal linking between SEO pages

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| source_page_id | uuid | No | - | References seo_pages |
| target_page_id | uuid | No | - | References seo_pages |
| anchor_text | text | No | - | Link text |
| relevance_score | numeric | Yes | - | AI-calculated relevance |
| created_at | timestamptz | No | now() | Record creation time |

**Indexes:**
- Primary key on `id`
- Foreign key on `source_page_id`
- Foreign key on `target_page_id`
- Index on `(source_page_id, target_page_id)`

**RLS Policies:**
- `Admins can manage SEO internal links`: ALL where has_role(auth.uid(), 'admin')

---

## Custom Types (Enums)

```sql
CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TYPE subscription_tier AS ENUM ('starter', 'professional', 'business', 'enterprise');

CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid');

CREATE TYPE project_type AS ENUM ('mail_merge', 'seo');

CREATE TYPE project_status AS ENUM ('draft', 'active', 'archived');

CREATE TYPE data_source_type AS ENUM ('csv', 'excel', 'google_sheets');

CREATE TYPE template_type AS ENUM ('certificate', 'invoice', 'label', 'flyer', 'custom');

CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'canceled');

CREATE TYPE seo_page_type AS ENUM ('service', 'location', 'product', 'blog', 'custom');
```

---

## Database Functions

### 1. get_user_workspace_id

```sql
CREATE OR REPLACE FUNCTION public.get_user_workspace_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = _user_id;
$$;
```

**Purpose**: Get the workspace ID for a given user (used in RLS policies)

---

### 2. has_role

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;
```

**Purpose**: Check if a user has a specific role (prevents RLS recursion)

---

### 3. update_updated_at_column

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

**Purpose**: Automatically update `updated_at` timestamp on row updates

---

### 4. handle_new_user

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
```

**Purpose**: Automatically create workspace and profile when new user signs up

---

### 5. grant_admin_to_specific_email

```sql
CREATE OR REPLACE FUNCTION public.grant_admin_to_specific_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
```

**Purpose**: Grant admin role to specific email address on signup

---

## Storage Buckets

### 1. user-uploads (Private)
- **Purpose**: CSV, Excel, Google Sheets data files
- **Public**: No
- **Max File Size**: 10MB
- **RLS**: Users can only access files in their workspace folder

### 2. templates (Public)
- **Purpose**: PDF template files
- **Public**: Yes
- **Max File Size**: 50MB
- **RLS**: Public read, workspace-scoped write

### 3. generated-pdfs (Private)
- **Purpose**: Generated PDF output files
- **Public**: No
- **Max File Size**: 100MB
- **Auto-delete**: After 30 days
- **RLS**: Users can only access files from their workspace

### 4. seo-assets (Public)
- **Purpose**: Images for SEO pages
- **Public**: Yes
- **Max File Size**: 5MB
- **RLS**: Public read, admin write

---

## Data Access Patterns

### Pattern 1: Workspace-Scoped Queries

```typescript
// All user data is automatically filtered by workspace
const { data: projects } = await supabase
  .from('projects')
  .select('*');
// RLS policy automatically adds: WHERE workspace_id = get_user_workspace_id(auth.uid())
```

### Pattern 2: Role-Based Access

```typescript
// Admin-only operations
const { data: allWorkspaces } = await supabase
  .from('workspaces')
  .select('*');
// Only returns data if has_role(auth.uid(), 'admin') = true
```

### Pattern 3: Public + Authenticated Views

```typescript
// SEO pages visible to everyone if published, all to admins
const { data: pages } = await supabase
  .from('seo_pages')
  .select('*');
// Returns published pages to everyone, all pages to admins
```

### Pattern 4: Cross-Table RLS

```typescript
// Field mappings filtered through project ownership
const { data: mappings } = await supabase
  .from('field_mappings')
  .select('*, projects(workspace_id)');
// RLS checks that projects.workspace_id = user's workspace
```

---

## Maintenance Tasks

### Daily
- Monitor storage bucket usage
- Check for expired generated PDFs
- Review failed merge jobs

### Weekly
- Analyze query performance
- Review RLS policy effectiveness
- Check subscription sync with Stripe

### Monthly
- Archive old usage logs
- Backup database
- Audit user roles and permissions

---

## Migration Strategy

All schema changes must go through migrations:

```bash
# Create new migration
supabase migration new description_of_change

# Apply migration
supabase db push

# Rollback (manual SQL required)
supabase db reset
```

**Current Migration Status**: Schema fully migrated and tested ✅
