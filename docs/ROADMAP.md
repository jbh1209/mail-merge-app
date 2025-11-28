# Development Roadmap

> **📖 Foundation**: [Core Principles](./CORE_PRINCIPLES.md) — All development decisions flow from our dual-audience philosophy.

**Last Updated:** 2025-11-28  
**Version:** 1.1  
**Project Start**: November 2025

---

## Overview

This roadmap outlines the development phases for Mail Merge App, from foundation to full production launch.

**Estimated Timeline**: 5-7 months (November 2025 - May/June 2026)

**Core Philosophy**: Build intelligent automation that makes it simple for beginners AND fast for professionals.

---

## Phase 1: Foundation ✅ COMPLETE

**Duration**: 2 weeks  
**Status**: Complete  
**Completed**: 2025-11-15

### Goals
- Establish database architecture
- Implement authentication
- Set up multi-tenancy
- Configure basic infrastructure

### Deliverables
- ✅ 16 database tables with RLS
- ✅ Custom enums and types
- ✅ Database functions and triggers
- ✅ Authentication (email/password)
- ✅ Workspace creation on signup
- ✅ Role-based access control
- ✅ Storage buckets configured
- ✅ Supabase integration complete

### Technical Decisions

**Decision**: Use Lovable Cloud (Supabase)  
**Rationale**: Fully managed backend, RLS for security, real-time capabilities  
**Trade-offs**: Vendor lock-in, but faster development

**Decision**: Multi-tenant via workspace_id  
**Rationale**: Simple, effective data isolation with RLS  
**Alternative Considered**: Separate databases per tenant (too complex)

**Decision**: JWT authentication  
**Rationale**: Stateless, scalable, built into Supabase  
**Alternative Considered**: Session-based auth (requires state management)

### Metrics
- Database schema: 16 tables, 9 custom types
- RLS policies: ~40 policies across all tables
- Storage buckets: 4 buckets configured

---

## Phase 2: Data & Template Handling 🚧 IN PROGRESS

**Duration**: 4-5 weeks  
**Start**: 2025-11-18 (planned)  
**End**: 2025-12-20 (estimated)

### Goals
- Enable users to upload and manage data sources
- Implement template management
- Build AI-powered field mapping

### Milestones

#### Week 1-2: Data Upload & Parsing
- [ ] File upload UI (drag-and-drop)
- [ ] CSV parser edge function
- [ ] Excel parser edge function
- [ ] Data preview component
- [ ] Data source management page

**Blockers**: None  
**Dependencies**: Phase 1 complete

#### Week 2-3: Template Management
- [ ] Template upload UI
- [ ] PDF preview generation
- [ ] Template gallery component
- [ ] Template configuration (dimensions, bleed)
- [ ] Public template library (seed data)

**Blockers**: None  
**Dependencies**: Storage bucket setup

#### Week 3-4: AI Field Detection
- [ ] Enable Lovable AI for project
- [ ] AI template analysis edge function
- [ ] Field detection algorithm
- [ ] Confidence scoring
- [ ] Field mapping suggestions

**Blockers**: Need Lovable AI enabled  
**Dependencies**: Template upload working

#### Week 4-5: Field Mapping Interface
- [ ] Visual mapping UI
- [ ] Drag-and-drop field connections
- [ ] Manual override capability
- [ ] Mapping preview
- [ ] Save/load mappings

**Blockers**: None  
**Dependencies**: AI field detection

### Deliverables
- Functional data upload system
- Template management system
- AI-assisted field mapping
- Complete UI for Phase 2 features

### Technical Challenges

**Challenge**: PDF parsing in Deno  
**Solution**: Use `pdf-parse` or `pdfjs-dist` libraries  
**Risk**: Limited library support in Deno runtime  
**Mitigation**: Test early, have fallback plan

**Challenge**: Large file uploads  
**Solution**: Chunked uploads, progress tracking  
**Risk**: Timeout on slow connections  
**Mitigation**: Client-side compression, retry logic

**Challenge**: AI accuracy for field detection  
**Solution**: Use GPT-5 or Gemini 2.5 Pro for better accuracy  
**Risk**: Cost of AI calls  
**Mitigation**: Cache results, use cheaper model for simple templates

---

## Phase 3: PDF Generation & Data Enhancements 📋 PLANNED

**Duration**: 4-5 weeks  
**Start**: 2025-12-20 (estimated)  
**End**: 2026-01-27 (estimated)

### Goals
- Build asynchronous job queue
- Implement PDF generation worker
- **Real barcode and QR code generation** (not placeholders)
- **Polish sequential numbering UX**
- Track usage and enforce quotas
- Enable bulk downloads

### Milestones

#### Week 1: Job Queue System
- [ ] Job creation edge function
- [ ] Job queue table polling
- [ ] Job locking mechanism
- [ ] Status tracking
- [ ] Real-time progress updates

#### Week 2-3: PDF Generation & Enhancements
- [ ] PDF template loading
- [ ] Data merging logic
- [ ] **Real barcode generation** (bwip-js or similar)
- [ ] **Real QR code generation** (qrcode library)
- [ ] Sequential numbering (already functional, polish UI)
- [ ] Individual PDF storage
- [ ] Error handling and retries

#### Week 4: AI-Suggested Enhancements
- [ ] AI detection of SKU/barcode fields
- [ ] AI detection of URL fields for QR codes
- [ ] Smart suggestions UI ("Add barcode?")
- [ ] Enhancement preview in mapping interface

#### Week 4-5: Usage & Downloads
- [ ] Usage logging
- [ ] Quota checking
- [ ] Quota enforcement
- [ ] Signed download URLs
- [ ] Bulk ZIP downloads
- [ ] Auto-deletion after 30 days

### Deliverables
- Working PDF generation pipeline
- **Real barcode generation** (CODE128, CODE39, EAN13, UPC-A)
- **Real QR code generation** (URLs, vCard, custom data)
- **AI-suggested enhancements** based on field analysis
- Job monitoring UI
- Usage tracking system
- Download management

### Performance Targets
- < 5 seconds per PDF
- Support 1000 PDFs per job
- < 10 minute total for 100 PDFs
- 99% success rate
- Barcode/QR generation: < 500ms per code

### Risks

**Risk**: PDF generation too slow  
**Impact**: High - affects user experience  
**Mitigation**: Optimize PDF library usage, add caching, use faster library  
**Contingency**: Implement queue with priority levels

**Risk**: Storage costs too high  
**Impact**: Medium - affects profitability  
**Mitigation**: Auto-delete after 30 days, compress PDFs  
**Contingency**: Charge for extended storage

---

## Phase 4: Full SaaS Experience 📋 PLANNED

**Duration**: 2-3 weeks  
**Start**: 2026-01-20 (estimated)  
**End**: 2026-02-10 (estimated)

### Goals
- Integrate Stripe billing
- Enforce subscription tiers
- Build settings and account management
- Polish UI/UX

### Milestones

#### Week 1: Stripe Integration
- [ ] Stripe account setup
- [ ] Webhook handler edge function
- [ ] Subscription creation flow
- [ ] Payment method management
- [ ] Invoice generation

#### Week 2: Subscription Enforcement
- [ ] Feature gating by tier
- [ ] Quota enforcement
- [ ] Upgrade prompts
- [ ] Trial period handling
- [ ] Overage charges

#### Week 3: Settings & Polish
- [ ] Profile settings page
- [ ] Workspace settings page
- [ ] Billing portal
- [ ] Account deletion
- [ ] UI polish and bug fixes

### Deliverables
- Working billing system
- Complete settings pages
- Production-ready UI

### Go-Live Checklist
- [ ] All Phase 1-4 features complete
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] User acceptance testing done
- [ ] Documentation complete
- [ ] Marketing site ready
- [ ] Support system in place

---

## Phase 5: SEO CMS Backend 🔮 FUTURE

**Duration**: 3-4 weeks  
**Start**: 2026-02-10 (estimated)  
**End**: 2026-03-10 (estimated)

### Goals
- Build admin CMS interface
- Enable page creation and editing
- Implement draft/publish workflow

### Features
- SEO page management
- Rich text editor
- Template system
- Schema markup editor
- Internal linking

### Dependencies
- Phase 4 complete
- Admin role fully tested

---

## Phase 6: SEO CMS Frontend 🔮 FUTURE

**Duration**: 2-3 weeks  
**Start**: 2026-03-10 (estimated)  
**End**: 2026-04-01 (estimated)

### Goals
- Public page rendering
- Dynamic routing
- SEO optimization
- Performance optimization

### Features
- Server-side rendering (SSR)
- Sitemap generation
- Schema markup output
- CDN caching

### Performance Targets
- < 2s page load
- Lighthouse score > 90
- Core Web Vitals: All green

---

## Phase 7: SEO Automation 🔮 FUTURE

**Duration**: 4-5 weeks  
**Start**: 2026-04-01 (estimated)  
**End**: 2026-05-01 (estimated)

### Goals
- Bulk page generation
- AI content generation
- Automatic internal linking
- Keyword management

### Features
- Keyword import
- Bulk operations
- AI content assistance
- Link graph analysis

---

## Future Enhancements (Post-Launch)

### Q3 2026
- Mobile apps (iOS/Android)
- API v1 public release
- Zapier integration
- Advanced analytics

### Q4 2026
- White-label option
- Custom branding
- Advanced permissions
- SSO integration

### 2027
- Marketplace for templates
- Plugin system
- Advanced AI features
- Enterprise features

---

## Technical Debt Tracking

### Current Technical Debt
None yet (greenfield project)

### Planned Debt
- Defer advanced caching until post-launch
- Defer mobile optimization until post-launch
- Use simple job queue instead of Redis initially

### Debt Payoff Schedule
- Q2 2026: Implement Redis for job queue
- Q3 2026: Add advanced caching layer
- Q4 2026: Optimize for mobile

---

## Dependencies & Blockers

### External Dependencies
- Lovable Cloud (Supabase): Available ✅
- Lovable AI Gateway: Available ✅
- Stripe API: Requires account setup 📋
- Google Sheets API: Requires OAuth setup 📋

### Current Blockers
None

### Potential Future Blockers
- Stripe account approval
- Google OAuth approval
- PDF library limitations in Deno

---

## Resource Planning

### Development Team
- 1 Full-stack Developer (you)
- AI Assistance (Lovable AI)

### Time Allocation
- Feature Development: 70%
- Bug Fixes: 15%
- Testing: 10%
- Documentation: 5%

### Budget Considerations
- Supabase: Free tier → Pro ($25/mo)
- Lovable AI: Usage-based pricing
- Stripe: 2.9% + 30¢ per transaction
- Domain & Hosting: ~$50/year
- Email service: ~$20/mo

---

## Success Metrics

### Phase 2 Success
- [ ] Users can upload CSV/Excel
- [ ] Data preview works correctly
- [ ] Templates upload and parse
- [ ] AI field detection > 80% accuracy
- [ ] Mapping interface is intuitive

### Phase 3 Success
- [ ] PDF generation works end-to-end
- [ ] Job completion rate > 99%
- [ ] Average generation time < 5s per PDF
- [ ] No data loss or corruption
- [ ] Downloads work reliably

### Phase 4 Success (Launch)
- [ ] 10 beta users signed up
- [ ] Payment processing works
- [ ] No critical bugs
- [ ] Page load < 2s
- [ ] Uptime > 99%

### Post-Launch (6 months)
- [ ] 100 paid customers
- [ ] $5,000 MRR
- [ ] < 5% churn rate
- [ ] NPS > 40
- [ ] Support response < 24h

---

## Communication Plan

### Weekly Updates
- Document progress in this file
- Update feature status in FEATURES.md
- Note any blockers or changes

### Monthly Reviews
- Review roadmap priorities
- Adjust timeline if needed
- Update success metrics

### Launch Communication
- Announcement blog post
- Email to beta users
- Social media posts
- Product Hunt launch

---

## Risk Management

### High Priority Risks

**Risk**: PDF generation performance  
**Likelihood**: Medium  
**Impact**: High  
**Mitigation**: Benchmark early, optimize critical path  
**Owner**: Developer  
**Status**: Monitoring

**Risk**: AI costs exceed budget  
**Likelihood**: Low  
**Impact**: Medium  
**Mitigation**: Cache aggressively, use cheaper models  
**Owner**: Developer  
**Status**: Monitoring

**Risk**: Stripe compliance issues  
**Likelihood**: Low  
**Impact**: High  
**Mitigation**: Follow Stripe best practices, legal review  
**Owner**: Developer  
**Status**: Planned

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2025-11-15 | Initial roadmap created | Project kickoff |
| 2025-11-15 | Phase 1 marked complete | Database setup done |
| 2025-11-28 | Added Core Principles reference | Formalized dual-audience philosophy |
| 2025-11-28 | Phase 3 expanded with barcode/QR | Expanded scope for data enhancements |
| 2025-11-28 | Added AI-suggested enhancements | Proactive feature suggestions |

---

## Next Steps

### Immediate (This Week)
1. Begin Phase 2: File Upload UI
2. Set up edge function for CSV parsing
3. Test file upload to storage bucket

### Short-term (Next 2 Weeks)
1. Complete data upload functionality
2. Begin template upload
3. Research PDF parsing libraries

### Medium-term (Next Month)
1. Complete Phase 2
2. Begin Phase 3: Job queue
3. Test PDF generation

### Long-term (Next 3 Months)
1. Complete Phases 2-4
2. Launch beta version
3. Gather user feedback

---

## Questions & Open Items

### Technical Questions
- [ ] Which PDF library works best in Deno?
- [ ] How to handle very large Excel files (>10MB)?
- [ ] Best approach for real-time progress updates?

### Business Questions
- [ ] What pricing tiers to offer?
- [ ] What quotas per tier?
- [ ] How to handle overage billing?

### Design Questions
- [ ] Color scheme and branding?
- [ ] Onboarding flow?
- [ ] Error messaging tone?

---

## Documentation Status

- ✅ PRODUCT_OVERVIEW.md: Complete
- ✅ ARCHITECTURE.md: Complete
- ✅ DATABASE.md: Complete
- ✅ FEATURES.md: Complete
- ✅ USER_FLOWS.md: Complete
- ✅ API.md: Complete
- ✅ ROADMAP.md: Complete (this document)
- 📋 DEVELOPMENT.md: To be written

---

## Conclusion

This roadmap provides a clear path from our current position (Phase 1 complete) to a production-ready SaaS application. The timeline is aggressive but achievable with focused effort and effective use of AI assistance.

**Key Focus**: Complete Phase 2 by end of year, launch beta in Q1 2026.

**Next Milestone**: File upload working by 2025-11-25
