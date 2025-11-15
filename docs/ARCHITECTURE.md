# System Architecture

**Last Updated:** 2025-11-15  
**Version:** 1.0

## Overview

Mail Merge App is built as a multi-tenant SaaS platform with two distinct but integrated subsystems:

1. **Private SaaS Application** - Authenticated user interface for mail merge operations
2. **Public SEO Engine** - Public-facing website for SEO content delivery

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  React/Vite SPA          │         Public SEO Pages            │
│  (Authenticated)         │         (Public Access)              │
│  - Dashboard             │         - Dynamic Routes             │
│  - Template Manager      │         - SEO-optimized HTML         │
│  - Data Source Manager   │         - Schema Markup              │
│  - Job Monitor           │                                      │
└──────────────┬───────────┴──────────────┬──────────────────────┘
               │                          │
               │    HTTPS/WebSocket       │
               │                          │
┌──────────────▼──────────────────────────▼──────────────────────┐
│                    APPLICATION LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                 Lovable Cloud (Supabase)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Edge Functions (Deno Runtime)                           │  │
│  │  - File Upload Handler                                   │  │
│  │  - Spreadsheet Parser                                    │  │
│  │  - AI Field Mapper                                       │  │
│  │  - PDF Generation Worker                                 │  │
│  │  - Job Queue Manager                                     │  │
│  │  - Stripe Webhook Handler                                │  │
│  │  - SEO Page Renderer                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Authentication (Supabase Auth)                          │  │
│  │  - Email/Password                                        │  │
│  │  - Google OAuth                                          │  │
│  │  - JWT Token Management                                  │  │
│  │  - Session Persistence                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL Database (Supabase)                                 │
│  - Multi-tenant data isolation                                  │
│  - Row-Level Security (RLS)                                     │
│  - Real-time subscriptions                                      │
│  - Full-text search                                             │
│                                                                  │
│  Storage Buckets                                                │
│  - user-uploads (Private)                                       │
│  - templates (Public)                                           │
│  - generated-pdfs (Private)                                     │
│  - seo-assets (Public)                                          │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                              │
├─────────────────────────────────────────────────────────────────┤
│  - Stripe (Payments & Subscriptions)                            │
│  - Lovable AI Gateway (AI/ML Features)                          │
│  - Google Sheets API (Data Import)                              │
│  - SendGrid (Email Notifications)                               │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React 18.3+
- **Build Tool**: Vite
- **Language**: TypeScript
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod validation

### Backend
- **Platform**: Lovable Cloud (Supabase)
- **Database**: PostgreSQL 15+
- **Auth**: Supabase Auth (JWT)
- **Storage**: Supabase Storage
- **Edge Functions**: Deno runtime
- **Real-time**: Supabase Realtime (WebSocket)

### External Integrations
- **Payments**: Stripe
- **AI**: Lovable AI Gateway (Gemini/GPT models)
- **Email**: SendGrid
- **Analytics**: PostHog (planned)

## Multi-Tenant Architecture

### Workspace Isolation

Every user belongs to a workspace, which provides complete data isolation:

```sql
-- Workspace is the top-level tenant entity
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  subscription_tier subscription_tier,
  pages_quota INTEGER,
  pages_used_this_month INTEGER
);

-- All tenant data references workspace_id
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces,
  -- ... other fields
);
```

### Data Access Pattern

```typescript
// All queries are automatically scoped to user's workspace
const { data } = await supabase
  .from('projects')
  .select('*');
  // RLS automatically filters by get_user_workspace_id(auth.uid())
```

### RLS Policy Pattern

```sql
-- Standard RLS policy for workspace-scoped data
CREATE POLICY "Users can view data in their workspace"
ON projects FOR SELECT
USING (workspace_id = get_user_workspace_id(auth.uid()));
```

## Security Model

### Authentication Flow

```
1. User submits credentials
   ↓
2. Supabase Auth validates
   ↓
3. JWT token issued with user_id
   ↓
4. Client stores token in localStorage
   ↓
5. All API requests include Authorization header
   ↓
6. RLS policies enforce workspace isolation
```

### Role-Based Access Control (RBAC)

```typescript
// Roles are stored in separate table
type AppRole = 'admin' | 'moderator' | 'user';

// Security definer function checks roles
CREATE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

### Row-Level Security (RLS)

All tables have RLS enabled with policies using:
- `auth.uid()` - Current authenticated user
- `get_user_workspace_id(auth.uid())` - User's workspace
- `has_role(auth.uid(), 'role')` - Role checking

## Data Flow Diagrams

### Mail Merge Flow

```
User uploads CSV
    ↓
Edge Function: parse-data
    ↓
Store in data_sources table
    ↓
AI analyzes fields
    ↓
Generate mapping suggestions
    ↓
User confirms/adjusts mapping
    ↓
Store in field_mappings table
    ↓
User triggers PDF generation
    ↓
Edge Function: create-merge-job
    ↓
Job queue (merge_jobs table)
    ↓
Edge Function: process-merge-job
    ↓
For each row:
  - Merge data with template
  - Generate PDF
  - Upload to storage
  - Update progress
    ↓
Mark job complete
    ↓
User downloads PDFs
```

### SEO Page Rendering Flow

```
Public request to /services/plumbing
    ↓
Edge Function: render-seo-page
    ↓
Query seo_pages by slug
    ↓
Apply RLS (is_published = true)
    ↓
Fetch content_blocks JSON
    ↓
Render HTML with schema markup
    ↓
Return SSR HTML response
    ↓
Browser renders page
```

## Scalability Considerations

### Horizontal Scaling
- Edge functions auto-scale with traffic
- Database read replicas for high read load
- CDN caching for static assets and SEO pages

### Vertical Scaling
- Database instance can be upgraded
- Connection pooling with PgBouncer
- Background job processing with queue

### Async Processing
- PDF generation runs asynchronously
- Job queue prevents blocking UI
- Real-time progress updates via WebSocket

### Caching Strategy
- SEO pages cached at CDN edge
- API responses cached with short TTL
- Static assets cached indefinitely
- Database query results cached client-side

## Storage Architecture

### Bucket Configuration

```typescript
// user-uploads: Private bucket for data files
{
  name: 'user-uploads',
  public: false,
  fileSizeLimit: 10MB,
  allowedMimeTypes: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
}

// templates: Public bucket for PDF templates
{
  name: 'templates',
  public: true,
  fileSizeLimit: 50MB,
  allowedMimeTypes: ['application/pdf']
}

// generated-pdfs: Private bucket for outputs
{
  name: 'generated-pdfs',
  public: false,
  fileSizeLimit: 100MB,
  allowedMimeTypes: ['application/pdf'],
  expirationDays: 30
}

// seo-assets: Public bucket for SEO images
{
  name: 'seo-assets',
  public: true,
  fileSizeLimit: 5MB,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
}
```

### Storage RLS Policies

```sql
-- Users can upload to their workspace folder
CREATE POLICY "Users can upload to workspace folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-uploads' AND
  (storage.foldername(name))[1] = get_user_workspace_id(auth.uid())::text
);

-- Users can only access their workspace files
CREATE POLICY "Users can access workspace files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-uploads' AND
  (storage.foldername(name))[1] = get_user_workspace_id(auth.uid())::text
);
```

## Deployment Architecture

### Environment Structure
- **Development**: Local Vite dev server + Lovable Cloud dev project
- **Staging**: Lovable preview deployment
- **Production**: Lovable production deployment

### CI/CD Pipeline
- Git push triggers automatic deployment
- Database migrations run automatically
- Edge functions deployed automatically
- Zero-downtime deployments

### Monitoring
- Error tracking with Sentry (planned)
- Performance monitoring with PostHog (planned)
- Database metrics via Supabase dashboard
- Uptime monitoring with UptimeRobot (planned)

## Security Best Practices

### Input Validation
- All user input validated with Zod schemas
- SQL injection prevented by parameterized queries
- XSS prevention via React's built-in escaping
- CSRF protection via SameSite cookies

### Data Encryption
- All data encrypted at rest (Supabase default)
- TLS 1.3 for data in transit
- JWT tokens signed with strong secret
- Sensitive data hashed (passwords via Supabase Auth)

### API Security
- Rate limiting on edge functions
- JWT token validation on all protected endpoints
- RLS policies enforce data isolation
- CORS configured for known origins only

### Secrets Management
- API keys stored in Supabase secrets
- Never committed to version control
- Rotated regularly
- Accessed only by edge functions

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Page Load Time | < 2s | TBD |
| API Response Time | < 500ms | TBD |
| PDF Generation Time | < 5s per page | TBD |
| Database Query Time | < 100ms | TBD |
| Uptime | 99.9% | TBD |
| Concurrent Users | 1000+ | TBD |

## Disaster Recovery

### Backup Strategy
- Automated daily database backups (Supabase)
- Point-in-time recovery (PITR) enabled
- Storage files backed up to S3
- Backup retention: 30 days

### Incident Response
1. Monitor alerts trigger notification
2. On-call engineer investigates
3. Rollback deployment if needed
4. Fix root cause
5. Post-mortem documentation

## Future Architecture Enhancements

### Phase 2 (Q2 2025)
- Redis cache layer for hot data
- Job queue system (pg_cron or external)
- Webhook delivery system

### Phase 3 (Q3 2025)
- Read replicas for scaling
- CDN integration for SEO pages
- Advanced analytics pipeline

### Phase 4 (Q4 2025)
- Microservices extraction (if needed)
- GraphQL API layer
- Event-driven architecture
