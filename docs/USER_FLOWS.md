# User Flows

**Last Updated:** 2025-11-15  
**Version:** 1.0

This document describes the key user journeys through the Mail Merge App.

---

## Flow 1: Onboarding & Workspace Setup ✅

**Actors**: New User  
**Goal**: Create account and set up workspace  
**Status**: Complete

### Steps

1. **Landing Page**
   - User visits site
   - Sees value proposition and features
   - Clicks "Sign Up" CTA

2. **Sign Up**
   - User enters email and password
   - User enters full name (optional)
   - Submits form
   - Backend trigger creates:
     - Workspace: `{name}'s Workspace`
     - Profile with `workspace_id`
     - User role: 'user'
     - If email matches admin list, also grants 'admin' role

3. **Email Confirmation**
   - In development: Auto-confirmed
   - In production: Email verification required

4. **First Login**
   - User redirected to dashboard
   - Sees onboarding tour (if `onboarding_completed = false`)
   - Workspace name and subscription tier displayed

5. **Onboarding Tour** (Future)
   - Step 1: Welcome message
   - Step 2: "Upload your first data file"
   - Step 3: "Choose or upload a template"
   - Step 4: "Generate your first PDFs"
   - Marks `profiles.onboarding_completed = true`

### Success Criteria
- ✅ User has active account
- ✅ User has workspace
- ✅ User has 'user' role
- ✅ User can access dashboard

### Error Handling
- Email already exists → Show error, suggest login
- Weak password → Show requirements
- Network error → Retry button

---

## Flow 2: Upload Data (Excel/CSV) 📋

**Actors**: Authenticated User  
**Goal**: Upload spreadsheet data for mail merge  
**Status**: Planned

### Steps

1. **Navigate to Data Sources**
   - User clicks "Data Sources" in sidebar
   - Sees list of existing data sources (if any)
   - Clicks "Upload New Data"

2. **File Upload**
   - Drag-and-drop zone appears
   - User drags CSV or Excel file
   - OR clicks to browse files
   - File validates:
     - ✓ Type: `.csv`, `.xlsx`, `.xls`
     - ✓ Size: < 10MB
     - ✓ Not corrupted
   - Upload progress shown

3. **File Processing**
   - Edge function `parse-data-file` called
   - Backend:
     - Reads file
     - Detects headers
     - Infers column types
     - Extracts sample rows
     - Stores in `data_sources` table
   - User sees "Processing..." spinner

4. **Data Preview**
   - Table view shows first 5 rows
   - Column headers displayed
   - Data types shown (string, number, date, etc.)
   - Row count displayed
   - User can:
     - Rename columns
     - Change data types
     - Filter rows (future)

5. **Save Data Source**
   - User clicks "Save"
   - Data source name auto-generated (or user provides)
   - Record created in `data_sources`:
     ```json
     {
       "id": "uuid",
       "workspace_id": "uuid",
       "project_id": "uuid",
       "source_type": "csv",
       "file_url": "storage_path",
       "row_count": 150,
       "parsed_fields": {...}
     }
     ```
   - Success toast shown
   - Redirects to project view

### Alternative Flow: Google Sheets

1. User clicks "Connect Google Sheet"
2. OAuth flow initiated
3. User authorizes Google account
4. User selects spreadsheet
5. User selects range (or uses entire sheet)
6. System fetches data via API
7. Same preview and save as above

### Success Criteria
- File uploaded to `user-uploads` bucket
- Data parsed correctly
- Record in `data_sources` table
- User can view and edit data

### Error Handling
- File too large → "Max 10MB. Try splitting your file."
- Invalid format → "Please upload CSV or Excel file."
- Parse error → "File appears corrupted. Please try another."
- No headers → Prompt user to identify header row

---

## Flow 3: Template Setup (Upload or Select) 📋

**Actors**: Authenticated User  
**Goal**: Add a PDF template for mail merge  
**Status**: Planned

### Steps

#### Path A: Upload Custom Template

1. **Navigate to Templates**
   - User clicks "Templates" in sidebar
   - Sees gallery of existing templates
   - Clicks "Upload Template"

2. **Upload PDF**
   - File picker opens
   - User selects PDF file
   - Validates:
     - ✓ Type: `.pdf`
     - ✓ Size: < 50MB
   - Upload progress shown

3. **Template Configuration**
   - User enters template name
   - Selects template type: Certificate, Invoice, Label, Flyer, Custom
   - Sets dimensions (auto-detected or manual):
     - Width (mm)
     - Height (mm)
     - Bleed (mm)
   - Uploads preview image (optional)

4. **AI Field Detection**
   - Edge function `analyze-template` called
   - AI scans PDF for placeholders like `{{field_name}}`
   - Returns detected fields:
     ```json
     {
       "fields": [
         {
           "name": "first_name",
           "position": {"page": 1, "x": 100, "y": 200},
           "type": "text"
         }
       ]
     }
     ```
   - User reviews detected fields
   - Can add/edit/remove fields manually

5. **Save Template**
   - Record created in `templates` table
   - File stored in `templates` bucket
   - AI suggestions stored in `ai_layout_suggestions`
   - Success toast shown

#### Path B: Select Built-In Template

1. **Browse Template Library**
   - User sees curated templates
   - Filters by type, size, industry
   - Previews template

2. **Select Template**
   - User clicks "Use This Template"
   - Template copied to user's workspace
   - User can customize (future)

### Success Criteria
- Template uploaded or selected
- Fields detected (if placeholders exist)
- Record in `templates` table
- Template available for mapping

### Error Handling
- File not PDF → "Please upload a PDF file."
- No fields detected → "No placeholders found. Would you like to add them manually?"
- Upload failed → Retry option

---

## Flow 4: AI-Assisted Field Mapping 📋

**Actors**: Authenticated User  
**Goal**: Map data columns to template fields  
**Status**: Planned

### Steps

1. **Start Mapping**
   - User has data source and template selected
   - Clicks "Map Fields"
   - Mapping interface loads

2. **View AI Suggestions**
   - Left panel: Data columns
   - Right panel: Template fields
   - AI has pre-mapped fields with confidence scores:
     ```
     Data Column       →  Template Field    Confidence
     "First Name"      →  {{first_name}}    95%
     "Last Name"       →  {{last_name}}     98%
     "Email Address"   →  {{email}}         87%
     ```
   - High-confidence mappings (>90%) shown in green
   - Low-confidence (<70%) shown in yellow
   - Unmapped fields shown in gray

3. **Review Mappings**
   - User can:
     - ✓ Accept AI suggestion
     - ✗ Reject and remap manually
     - + Add new mapping
     - − Remove mapping

4. **Manual Mapping**
   - User drags data column to template field
   - OR selects from dropdown
   - Visual connection line drawn
   - Confidence score updates (if using AI)

5. **Validation**
   - System checks:
     - All required template fields mapped
     - No duplicate mappings
     - Data types compatible
   - Shows warnings if issues found

6. **Preview Mapping**
   - User clicks "Preview"
   - Shows first data row merged with template
   - Renders PDF preview
   - User can adjust if needed

7. **Save Mapping**
   - User clicks "Save Mapping"
   - Record created in `field_mappings`:
     ```json
     {
       "id": "uuid",
       "project_id": "uuid",
       "data_source_id": "uuid",
       "template_id": "uuid",
       "mappings": [
         {
           "template_field": "{{first_name}}",
           "data_column": "First Name",
           "confidence": 0.95
         }
       ],
       "user_confirmed": true
     }
     ```
   - User redirected to "Generate PDFs" step

### Success Criteria
- All required fields mapped
- Mapping saved in database
- User can proceed to generation

### Error Handling
- Unmapped required fields → Block proceed, highlight missing
- Data type mismatch → Warn user, suggest transformation
- No fields detected in template → Suggest manual field addition

---

## Flow 5: PDF Generation & Download 📋

**Actors**: Authenticated User  
**Goal**: Generate personalized PDFs from data  
**Status**: Planned

### Steps

1. **Review Setup**
   - User sees summary:
     - Data source: "customers.csv" (150 rows)
     - Template: "Certificate Template"
     - Field mappings: 5 mapped
   - Estimated pages: 150
   - Quota check:
     - Pages used this month: 50
     - Pages quota: 100
     - Remaining: 50
     - **This job exceeds quota!**

2. **Quota Handling**
   - **If quota sufficient:**
     - Show estimated cost: "$0 (within plan)"
     - Proceed button enabled
   - **If quota exceeded:**
     - Free/Pro: "Upgrade to continue" button
     - Business: "Overage charges apply: $15.00"
     - Enterprise: Allow, bill overage

3. **Start Generation**
   - User clicks "Generate PDFs"
   - Edge function `create-merge-job` called
   - Job record created:
     ```json
     {
       "id": "uuid",
       "status": "queued",
       "total_pages": 150,
       "processed_pages": 0
     }
     ```
   - User redirected to job monitor

4. **Job Processing**
   - Background worker `process-merge-job` starts
   - For each row:
     - Load template
     - Replace placeholders with data
     - Generate PDF
     - Upload to storage
     - Update `processed_pages`
   - Real-time updates via WebSocket/polling:
     - Progress bar: "45/150 complete (30%)"
     - Time remaining: "~5 minutes"

5. **Job Completion**
   - All PDFs generated
   - Status updated to `completed`
   - Usage logged:
     - 150 pages added to `pages_used_this_month`
     - Record in `usage_logs`
   - Email notification sent (future)
   - Success toast: "150 PDFs ready!"

6. **Download Options**
   - **Individual Download**
     - List of generated PDFs
     - Each with "Download" button
     - Signed URL generated on-click
   - **Bulk Download**
     - "Download All as ZIP" button
     - Edge function creates ZIP
     - Download starts

7. **File Management**
   - Files stored in `generated-pdfs` bucket
   - Path: `{workspace_id}/{job_id}/{row_id}.pdf`
   - Auto-expire after 30 days
   - User can extend expiration (future)

### Alternative Flows

#### Job Fails
1. Error occurs during processing
2. Status updated to `failed`
3. Error message stored
4. User notified with error details
5. Option to retry

#### Job Canceled
1. User clicks "Cancel" during processing
2. Status updated to `canceled`
3. Partial PDFs still accessible
4. Usage counted for completed pages only

### Success Criteria
- Job completes successfully
- All PDFs generated and accessible
- Usage tracked correctly
- User can download files

### Error Handling
- Quota exceeded → Block or charge overage
- Template not found → Alert user, go back
- Data error (missing required field) → Skip row, log error
- Storage full → Alert admin, pause jobs
- PDF generation timeout → Retry up to 3 times

---

## Flow 6: SEO Page Creation & Publishing 🔮

**Actors**: Admin User  
**Goal**: Create and publish an SEO-optimized page  
**Status**: Future

### Steps

1. **Navigate to SEO Manager**
   - Admin clicks "SEO" in sidebar
   - Sees list of existing pages
   - Clicks "Create New Page"

2. **Choose Page Type**
   - Service page
   - Location page
   - Product page
   - Blog post
   - Custom page
   - Selects "Service page"

3. **Select Template** (if available)
   - Option to use template
   - Pre-fills fields and content blocks
   - OR start from scratch

4. **Enter SEO Metadata**
   - URL slug: `/services/plumbing`
   - Page title: "Professional Plumbing Services | Company Name"
   - Meta description: "Expert plumbing services..."
   - H1: "Professional Plumbing Services"
   - Target keyword: "plumbing services"

5. **Add Content Blocks**
   - Hero section:
     - Title
     - Summary
     - CTA button
     - Hero image
   - Content sections:
     - Rich text editor
     - Add images
     - Add videos
     - Add FAQ blocks
   - Contact section:
     - Form fields
     - Contact info

6. **Configure Schema Markup**
   - Select schema type: LocalBusiness, Service, etc.
   - Fill required fields:
     - Business name
     - Address
     - Phone
     - Hours
   - JSON-LD preview shown

7. **Internal Linking**
   - AI suggests related pages
   - User selects pages to link
   - Specifies anchor text
   - Links stored in `seo_internal_links`

8. **Preview Page**
   - Desktop preview
   - Mobile preview
   - SEO preview (search result snippet)
   - Schema validation

9. **Save as Draft**
   - Page saved with `is_published = false`
   - Not visible on public site
   - URL: `/admin/seo/pages/{id}/edit`

10. **Publish**
    - User clicks "Publish"
    - Validation checks:
      - ✓ All required fields filled
      - ✓ Slug is unique
      - ✓ Schema markup valid
    - Update `is_published = true`
    - Set `published_at = now()`
    - Page live at `/services/plumbing`
    - Sitemap updated

### Success Criteria
- Page created and published
- SEO metadata complete
- Schema markup valid
- Page accessible on public site
- Indexed by search engines

### Error Handling
- Duplicate slug → Suggest alternatives
- Missing required fields → Highlight, block publish
- Invalid schema → Show validation errors
- Upload failed → Retry option

---

## Common UI Patterns

### Dashboard
- Recent activity feed
- Quick stats: Pages used, Jobs pending, Quota remaining
- Quick actions: Upload data, Create project, View billing

### Sidebar Navigation
- Dashboard
- Projects
- Data Sources
- Templates
- Jobs
- SEO (admin only)
- Settings
- Billing

### Project View
- Project details
- Linked data sources
- Linked templates
- Field mappings
- Generation history

### Job Monitor
- Job status (queued, processing, completed, failed)
- Progress bar
- Time remaining estimate
- Real-time updates
- Cancel/Retry buttons

### Settings
- Profile
- Workspace
- Billing & Subscription
- Users & Permissions (admin)
- API Keys (future)

---

## Mobile Considerations

### Responsive Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Mobile-Specific Flows
- Simplified navigation (hamburger menu)
- Stacked layouts
- Touch-friendly buttons (min 44px)
- Reduced data previews
- Download to device instead of browser

### Mobile Limitations
- File uploads: Use native file picker
- PDF preview: May open in external app
- Bulk downloads: May not support ZIP on iOS

---

## Accessibility Considerations

### WCAG 2.1 AA Compliance
- Keyboard navigation for all actions
- Screen reader announcements for dynamic updates
- Sufficient color contrast (4.5:1)
- Focus indicators visible
- Alt text for all images
- Form labels and error messages
- ARIA labels for complex UI

### User Preferences
- Respect prefers-reduced-motion
- Support browser zoom up to 200%
- Allow disabling auto-play

---

## Performance Targets

| Flow | Target Time | Metric |
|------|-------------|--------|
| Sign Up | < 3s | Time to dashboard |
| File Upload (10MB) | < 10s | Upload complete |
| Data Preview | < 2s | Table visible |
| Template Upload (50MB) | < 30s | Upload complete |
| AI Field Mapping | < 5s | Suggestions shown |
| Start PDF Job | < 1s | Job queued |
| PDF Generation | < 5s per page | File available |
| Page Load | < 2s | LCP < 2.5s |

---

## Future Enhancements

### Phase 2+
- [ ] Undo/Redo for mapping
- [ ] Collaborative editing (multiple users)
- [ ] Version history for templates
- [ ] A/B testing for SEO pages
- [ ] Scheduled publishing
- [ ] API access for integrations
- [ ] Zapier integration
- [ ] Mobile apps (iOS/Android)

---

## User Testing Checklist

For each flow:
- [ ] Happy path works end-to-end
- [ ] Error states handled gracefully
- [ ] Loading states shown
- [ ] Success feedback provided
- [ ] Mobile responsive
- [ ] Accessible (keyboard + screen reader)
- [ ] Performance meets targets
- [ ] Analytics tracking in place
