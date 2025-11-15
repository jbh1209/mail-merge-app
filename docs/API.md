# API Documentation

**Last Updated:** 2025-11-15  
**Version:** 1.0  
**Status**: Edge functions to be implemented

This document describes the backend API, edge functions, and external integrations.

---

## Edge Functions

Edge functions run on Deno runtime and are deployed automatically. All functions are located in `supabase/functions/`.

### Authentication

All edge functions (except public ones) require authentication:

```typescript
const authHeader = req.headers.get('Authorization');
if (!authHeader) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: corsHeaders
  });
}
```

### CORS Headers

All edge functions must include CORS headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle OPTIONS request
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

---

## Planned Edge Functions

### 1. parse-data-file
**Status**: 📋 Planned  
**Path**: `/functions/v1/parse-data-file`  
**Method**: POST  
**Auth**: Required

**Purpose**: Parse uploaded CSV or Excel file and extract schema

**Request Body**:
```json
{
  "file_url": "storage_path",
  "source_type": "csv" | "excel"
}
```

**Response**:
```json
{
  "columns": [
    {
      "name": "first_name",
      "type": "string",
      "sample_values": ["John", "Jane", "Bob"]
    }
  ],
  "row_count": 150
}
```

**Implementation**:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parse } from "https://deno.land/std@0.168.0/encoding/csv.ts";

serve(async (req) => {
  // 1. Get file URL from request
  // 2. Download file from storage
  // 3. Parse based on source_type
  // 4. Detect column types
  // 5. Extract sample values
  // 6. Return schema
});
```

**Error Handling**:
- 400: Invalid file format
- 404: File not found
- 500: Parse error

---

### 2. analyze-template
**Status**: 📋 Planned  
**Path**: `/functions/v1/analyze-template`  
**Method**: POST  
**Auth**: Required

**Purpose**: Use AI to detect fields in PDF template

**Request Body**:
```json
{
  "template_id": "uuid",
  "file_url": "storage_path"
}
```

**Response**:
```json
{
  "fields": [
    {
      "name": "first_name",
      "position": {"page": 1, "x": 100, "y": 200},
      "type": "text",
      "required": true
    }
  ],
  "confidence": 0.92
}
```

**Implementation**:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // 1. Download PDF from storage
  // 2. Extract text with pdf-parse
  // 3. Find placeholders like {{field_name}}
  // 4. Use AI to identify field types
  // 5. Calculate positions
  // 6. Return field definitions
});
```

**AI Integration**:
- Use Lovable AI (Gemini 2.5 Flash)
- Prompt: "Analyze this PDF text and identify all placeholder fields in the format {{field_name}}. Return JSON."

---

### 3. suggest-mappings
**Status**: 📋 Planned  
**Path**: `/functions/v1/suggest-mappings`  
**Method**: POST  
**Auth**: Required

**Purpose**: AI-powered mapping suggestions between data columns and template fields

**Request Body**:
```json
{
  "data_columns": ["First Name", "Last Name", "Email"],
  "template_fields": ["{{first_name}}", "{{last_name}}", "{{email}}"]
}
```

**Response**:
```json
{
  "mappings": [
    {
      "data_column": "First Name",
      "template_field": "{{first_name}}",
      "confidence": 0.98
    }
  ]
}
```

**Implementation**:
```typescript
// Use AI to match column names to field names
// Consider semantic similarity, not just exact matches
// Example: "Email Address" → {{email}} (confidence: 0.95)
```

---

### 4. create-merge-job
**Status**: 📋 Planned  
**Path**: `/functions/v1/create-merge-job`  
**Method**: POST  
**Auth**: Required

**Purpose**: Create a PDF generation job

**Request Body**:
```json
{
  "project_id": "uuid",
  "data_source_id": "uuid",
  "template_id": "uuid",
  "field_mapping_id": "uuid"
}
```

**Response**:
```json
{
  "job_id": "uuid",
  "status": "queued",
  "total_pages": 150,
  "estimated_time_seconds": 750
}
```

**Implementation**:
```typescript
serve(async (req) => {
  // 1. Validate quota
  // 2. Check subscription status
  // 3. Create job record in merge_jobs
  // 4. Return job ID
  // Background worker will pick it up
});
```

**Business Logic**:
- Check `pages_used_this_month < pages_quota`
- If exceeded and not enterprise, return 403
- If enterprise, allow and log overage

---

### 5. process-merge-job
**Status**: 📋 Planned  
**Path**: `/functions/v1/process-merge-job`  
**Method**: POST  
**Auth**: Service Role (internal only)

**Purpose**: Background worker to process PDF generation

**Request Body**:
```json
{
  "job_id": "uuid"
}
```

**Response**:
```json
{
  "status": "completed",
  "processed_pages": 150,
  "output_urls": ["url1", "url2", ...]
}
```

**Implementation**:
```typescript
serve(async (req) => {
  // 1. Fetch job details
  // 2. Load data source
  // 3. Load template
  // 4. Load field mappings
  // 5. For each data row:
  //    a. Replace placeholders
  //    b. Generate PDF with pdf-lib
  //    c. Upload to storage
  //    d. Update progress
  // 6. Update job status to completed
  // 7. Log usage
});
```

**Invocation**:
- Triggered by cron or manual call
- Use Supabase service role key

---

### 6. check-quota
**Status**: 📋 Planned  
**Path**: `/functions/v1/check-quota`  
**Method**: POST  
**Auth**: Required

**Purpose**: Check if user has quota for operation

**Request Body**:
```json
{
  "workspace_id": "uuid",
  "pages_requested": 150
}
```

**Response**:
```json
{
  "allowed": false,
  "pages_quota": 100,
  "pages_used": 50,
  "pages_remaining": 50,
  "overage_pages": 100,
  "overage_cost_cents": 1000
}
```

---

### 7. log-usage
**Status**: 📋 Planned  
**Path**: `/functions/v1/log-usage`  
**Method**: POST  
**Auth**: Service Role

**Purpose**: Record usage for billing

**Request Body**:
```json
{
  "workspace_id": "uuid",
  "user_id": "uuid",
  "merge_job_id": "uuid",
  "pages_generated": 150
}
```

**Response**:
```json
{
  "logged": true,
  "new_total": 200
}
```

---

### 8. stripe-webhook
**Status**: 📋 Planned  
**Path**: `/functions/v1/stripe-webhook`  
**Method**: POST  
**Auth**: Stripe signature verification

**Purpose**: Handle Stripe webhook events

**Events Handled**:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Implementation**:
```typescript
import Stripe from 'https://esm.sh/stripe@12.0.0';

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  
  // Verify signature
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    webhookSecret
  );
  
  // Handle event
  switch (event.type) {
    case 'customer.subscription.updated':
      // Update stripe_subscriptions table
      break;
    // ... other cases
  }
});
```

---

### 9. render-seo-page
**Status**: 🔮 Future  
**Path**: `/functions/v1/render-seo-page`  
**Method**: GET  
**Auth**: Public

**Purpose**: Server-side render SEO pages

**Query Params**:
- `slug`: Page slug (e.g., `/services/plumbing`)

**Response**: HTML page

**Implementation**:
```typescript
serve(async (req) => {
  // 1. Extract slug from URL
  // 2. Query seo_pages table
  // 3. Check is_published = true
  // 4. Render HTML with meta tags
  // 5. Inject schema markup
  // 6. Return HTML response
});
```

**Caching**:
- CDN cache for 1 hour
- Invalidate on page update

---

## Supabase Client Usage

### In React Components

```typescript
import { supabase } from "@/integrations/supabase/client";

// Query with RLS
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .eq('status', 'active');

// Insert
const { data, error } = await supabase
  .from('projects')
  .insert({
    name: 'My Project',
    workspace_id: workspaceId
  });

// Update
const { error } = await supabase
  .from('projects')
  .update({ status: 'archived' })
  .eq('id', projectId);

// Delete
const { error } = await supabase
  .from('projects')
  .delete()
  .eq('id', projectId);

// Real-time subscription
const channel = supabase
  .channel('projects')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'projects'
  }, (payload) => {
    console.log('Change received!', payload);
  })
  .subscribe();
```

### In Edge Functions

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Bypass RLS with service role
const { data } = await supabase
  .from('merge_jobs')
  .select('*')
  .eq('status', 'queued');
```

---

## Storage API

### Upload File

```typescript
const { data, error } = await supabase.storage
  .from('user-uploads')
  .upload(`${workspaceId}/${fileName}`, file);
```

### Download File

```typescript
const { data, error } = await supabase.storage
  .from('user-uploads')
  .download(`${workspaceId}/${fileName}`);
```

### Get Public URL

```typescript
const { data } = supabase.storage
  .from('templates')
  .getPublicUrl(filePath);
```

### Create Signed URL

```typescript
const { data, error } = await supabase.storage
  .from('generated-pdfs')
  .createSignedUrl(`${workspaceId}/${fileName}`, 3600); // 1 hour
```

---

## External Integrations

### 1. Stripe

**Purpose**: Subscription billing  
**Documentation**: https://stripe.com/docs/api

**Setup**:
```typescript
import Stripe from 'stripe';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
```

**Create Customer**:
```typescript
const customer = await stripe.customers.create({
  email: user.email,
  metadata: { workspace_id: workspaceId }
});
```

**Create Subscription**:
```typescript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId }],
  metadata: { workspace_id: workspaceId }
});
```

**Handle Webhooks**:
See `stripe-webhook` edge function above

---

### 2. Lovable AI Gateway

**Purpose**: AI features (field detection, mapping, content generation)  
**Documentation**: Internal

**Setup**:
```typescript
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ]
  })
});
```

**Models**:
- `google/gemini-2.5-flash`: Default, fast and cost-effective
- `google/gemini-2.5-pro`: More powerful for complex tasks
- `openai/gpt-5`: Alternative, more expensive

**Use Cases**:
- Field detection in templates
- Smart mapping suggestions
- SEO content generation (future)
- Internal linking suggestions (future)

---

### 3. Google Sheets API

**Purpose**: Import data from Google Sheets  
**Documentation**: https://developers.google.com/sheets/api

**Setup**: (Future)
```typescript
// OAuth flow for user authorization
// Store refresh token in user_secrets
// Fetch sheet data via API
```

---

### 4. SendGrid

**Purpose**: Transactional emails  
**Documentation**: https://docs.sendgrid.com/

**Setup**: (Future)
```typescript
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(Deno.env.get('SENDGRID_API_KEY')!);

await sgMail.send({
  to: user.email,
  from: 'noreply@mailmergeapp.com',
  subject: 'Your PDFs are ready!',
  text: 'Download your generated PDFs...'
});
```

**Email Types**:
- Welcome email
- Job completion notification
- Quota warning
- Payment failed
- Subscription expiring

---

## Rate Limiting

### Strategy
- Per user: 100 requests per minute
- Per workspace: 1000 requests per hour
- PDF generation: 10 concurrent jobs per workspace

### Implementation
```typescript
// Check rate limit before processing
const key = `ratelimit:${userId}`;
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, 60); // 1 minute
}
if (count > 100) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| UNAUTHORIZED | 401 | Missing or invalid auth token |
| FORBIDDEN | 403 | User lacks permission |
| NOT_FOUND | 404 | Resource not found |
| QUOTA_EXCEEDED | 403 | Monthly quota exceeded |
| INVALID_FILE | 400 | File format not supported |
| PARSE_ERROR | 400 | Failed to parse file |
| GENERATION_FAILED | 500 | PDF generation error |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |

---

## Monitoring & Logging

### Logging Best Practices

```typescript
// Log function entry
console.log('[parse-data-file] Starting', { fileUrl });

// Log important steps
console.log('[parse-data-file] Columns detected:', columns.length);

// Log errors with context
console.error('[parse-data-file] Parse failed', { fileUrl, error });

// Log function exit
console.log('[parse-data-file] Complete', { rowCount });
```

### Metrics to Track
- Function invocation count
- Average execution time
- Error rate
- Success rate
- Queue depth (for job processing)

---

## Future API Enhancements

### REST API (Phase 4+)
- Public API for external integrations
- API key management
- Webhook delivery
- Rate limiting per API key

### GraphQL API (Phase 5+)
- Unified data fetching
- Subscriptions for real-time updates
- Batching and caching

### SDKs
- JavaScript/TypeScript SDK
- Python SDK
- Ruby SDK

---

## Testing Edge Functions

### Local Testing

```bash
# Serve function locally
supabase functions serve parse-data-file

# Test with curl
curl -X POST http://localhost:54321/functions/v1/parse-data-file \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_url": "test.csv"}'
```

### Deployment

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy parse-data-file
```

---

## Security Checklist

- [ ] All edge functions validate auth tokens
- [ ] Service role key never exposed to client
- [ ] Input validation on all parameters
- [ ] SQL injection prevented (use parameterized queries)
- [ ] File uploads scanned for malware (future)
- [ ] Rate limiting implemented
- [ ] CORS configured correctly
- [ ] Secrets stored in environment variables
- [ ] Error messages don't leak sensitive info
- [ ] Webhook signatures verified (Stripe)

---

## Summary

| Function | Priority | Status | Dependencies |
|----------|----------|--------|--------------|
| parse-data-file | P0 | 📋 Planned | Phase 2 |
| analyze-template | P1 | 📋 Planned | Phase 2, Lovable AI |
| suggest-mappings | P1 | 📋 Planned | Phase 2, Lovable AI |
| create-merge-job | P0 | 📋 Planned | Phase 3 |
| process-merge-job | P0 | 📋 Planned | Phase 3 |
| check-quota | P0 | 📋 Planned | Phase 3 |
| log-usage | P0 | 📋 Planned | Phase 3 |
| stripe-webhook | P1 | 📋 Planned | Phase 4, Stripe |
| render-seo-page | P2 | 🔮 Future | Phase 6 |

**Next Steps**: Begin implementing Phase 2 edge functions
