# Product Overview: Mail Merge App

> **📖 Read First**: [Core Principles](./CORE_PRINCIPLES.md) — The foundational philosophy that guides all product decisions.

**Last Updated:** 2025-11-28  
**Version:** 1.1  
**Status:** Phase 2 In Progress (Data & Template Handling)

## Product Vision

Mail Merge App is a dual-purpose SaaS platform combining:
1. **PDF Mail Merge Engine** - Enterprise-grade document generation from data sources
2. **SEO Management System** - AI-powered content management for programmatic SEO

## Value Proposition

### For Mail Merge Users
- **For Beginners**: Upload data → Get beautiful labels (3 clicks, 60 seconds)
- **For Professionals**: Faster than InDesign for variable data projects
- AI-powered layout generation and field mapping
- Built-in barcode, QR code, and sequential numbering
- Support for multiple data sources (CSV, Excel, Google Sheets)
- Professional-grade output without technical knowledge
- Usage-based pricing with generous free tier

### For SEO Practitioners
- Generate hundreds of SEO-optimized pages from structured data
- Template-driven content with AI assistance
- Automatic internal linking and schema markup
- Built-in keyword research and page management
- Public-facing CMS with dynamic routing

## Target Users

### Primary Personas

**1. Non-Technical User (Beginner)**
- Needs: Simple label creation (address, shipping, name badges)
- Pain Points: Existing tools are too complex or expensive
- Goals: Professional output without learning curve
- Success: Creates perfect labels in under 60 seconds

**2. Professional Designer (Power User)**
- Needs: Speed advantage for variable data projects
- Pain Points: InDesign data merge is tedious, time-consuming
- Goals: Handle data complexity fast, then fine-tune design
- Success: Completes in 10 minutes what takes 1 hour in InDesign

**3. Small Business Owner**
- Needs: Product labels, inventory tags, shelf labels
- Pain Points: Need barcodes, QR codes, numbering
- Goals: Professional branded labels at scale
- Success: Generates 1000 labels with barcodes easily

**4. Marketing Team**
- Needs: Bulk personalized campaign materials
- Pain Points: Limited design flexibility in existing tools
- Goals: Create professional, branded documents at scale
- Success: Rapid iteration on label designs

**3. SEO Manager (SEO System)**
- Needs: Programmatic SEO for location/product pages
- Pain Points: Manual page creation doesn't scale
- Goals: Rank for hundreds of long-tail keywords

**4. Content Marketer (SEO System)**
- Needs: Structured content generation
- Pain Points: Maintaining consistency across many pages
- Goals: Efficient content production with quality control

## Core Features

### 1. PDF Mail Merge Engine

#### Data Source Management
- CSV/Excel file upload
- Google Sheets integration
- Live data preview and validation
- Support for up to 10,000 rows per merge job

#### Template System
- Upload custom PDF templates
- Visual field detection
- Built-in template library
- Design configuration (dimensions, bleed, margins)

#### AI-Assisted Field Mapping
- Automatic field detection from template
- Smart mapping suggestions based on data column names
- Confidence scoring for mapping quality
- Manual override and confirmation

#### Data Enhancements
- Sequential numbering (prefix, padding, start number)
- Barcode generation (CODE128, CODE39, EAN13, UPC-A)
- QR code generation (URLs, vCard, custom data)
- AI-suggested enhancements based on field analysis
- Image handling (logos, product photos)

#### PDF Generation Pipeline
- Asynchronous job processing
- Real-time progress tracking
- Batch generation for large datasets
- Download individual or bulk PDFs

#### Usage Tracking
- Per-workspace page quotas
- Usage logs with billing cycle tracking
- Overage alerts and notifications

### 2. SEO Management System

#### Content Management
- Template-based page creation
- Draft and publish workflow
- Rich text content blocks
- Custom fields per page type

#### SEO Features
- Keyword research and assignment
- Automatic meta tag generation
- Schema markup (JSON-LD)
- Internal linking suggestions
- XML sitemap generation

#### Page Types
- Service pages
- Location pages
- Product pages
- Blog posts
- Custom page types

#### AI Content Generation
- Bulk page generation from data
- Content optimization suggestions
- Automated internal linking
- Quality scoring

## Business Model

### Subscription Tiers

**Starter (Free)**
- 100 pages/month
- Basic templates
- Manual field mapping
- Community support

**Professional ($29/month)**
- 1,000 pages/month
- AI-assisted mapping
- Custom templates
- Priority support
- Google Sheets integration

**Business ($99/month)**
- 5,000 pages/month
- Advanced AI features
- Bulk operations
- API access
- Custom branding

**Enterprise (Custom)**
- Unlimited pages
- Dedicated support
- SLA guarantees
- White-label options
- Custom integrations

### Pricing Model
- Usage-based with monthly quotas
- Overage charges: $0.10 per additional page
- Annual billing discount: 20%
- Stripe-powered billing

## Key Differentiators

### 1. AI-First Approach
- Automatic field detection and mapping
- Intelligent content suggestions
- Predictive usage analytics

### 2. Dual-Purpose Platform
- Single platform for both mail merge and SEO
- Shared data sources and templates
- Unified workspace management

### 3. Developer-Friendly
- RESTful API access
- Webhook notifications
- Comprehensive documentation
- SDKs for popular languages

### 4. Enterprise-Ready
- Multi-tenant architecture
- Role-based access control
- Audit logging
- SOC 2 compliance path

## Success Metrics

### Product KPIs
- Monthly Active Workspaces
- Pages Generated per Month
- Template Upload Rate
- AI Mapping Acceptance Rate
- Customer Retention Rate

### Business KPIs
- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Conversion Rate (Free → Paid)
- Net Promoter Score (NPS)

## Competitive Landscape

### Mail Merge Competitors
- **Documerge**: Focused on document generation, lacks SEO features
- **WebMerge**: Strong API, limited template flexibility
- **PDF.co**: Developer-focused, not user-friendly for non-technical users

### SEO Tool Competitors
- **Webflow CMS**: Requires Webflow platform lock-in
- **ContentKing**: Monitoring only, no content generation
- **Programmatic SEO tools**: Expensive, require technical expertise

### Our Advantage
- Only platform combining both capabilities
- AI-powered automation reduces manual work
- More affordable than enterprise alternatives
- Better UX than developer-focused tools

## Roadmap Highlights

### Q1 2025 (Current)
- ✅ Complete database architecture
- ✅ Authentication and multi-tenancy
- 🚧 File upload and data parsing
- 🚧 Template management UI

### Q2 2025
- PDF generation pipeline
- AI field mapping
- Subscription enforcement
- Billing integration

### Q3 2025
- SEO CMS backend
- Public page rendering
- Keyword management
- Bulk operations

### Q4 2025
- AI content generation
- Advanced analytics
- API v1 launch
- Mobile app (iOS/Android)

## Technical Requirements

### Performance
- Page load time: < 2 seconds
- PDF generation: < 5 seconds per page
- Support 1000 concurrent users
- 99.9% uptime SLA

### Security
- SOC 2 Type II compliance
- Data encryption at rest and in transit
- Role-based access control
- Regular security audits

### Scalability
- Horizontal scaling for job workers
- CDN for static assets
- Database read replicas
- Async job processing

## Support & Documentation

### User Resources
- Getting started guide
- Video tutorials
- Template gallery
- Knowledge base
- Community forum

### Developer Resources
- API documentation
- SDK libraries
- Webhook guides
- Code examples
- Status page

## Privacy & Compliance

### Data Handling
- User data stored in secure database
- Temporary files deleted after 30 days
- GDPR-compliant data export
- Right to deletion

### Legal
- Terms of Service
- Privacy Policy
- Cookie Policy
- Acceptable Use Policy
- DMCA Policy
