# Development Guide

**Last Updated:** 2025-11-15  
**Version:** 1.0

This guide covers local development setup, workflows, and best practices.

---

## Prerequisites

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Git**: Latest version
- **Supabase CLI**: Latest version (for local development)
- **Code Editor**: VS Code recommended

---

## Initial Setup

### 1. Clone Repository

```bash
git clone <YOUR_GIT_URL>
cd mail-merge-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

The `.env` file is automatically managed by Lovable Cloud integration. It contains:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

**Important**: Never commit the `.env` file or share these values publicly.

### 4. Start Development Server

```bash
npm run dev
```

Application will be available at `http://localhost:5173`

---

## Project Structure

```
mail-merge-app/
├── docs/                      # Documentation (you are here)
│   ├── PRODUCT_OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── FEATURES.md
│   ├── USER_FLOWS.md
│   ├── API.md
│   ├── ROADMAP.md
│   └── DEVELOPMENT.md
├── public/                    # Static assets
│   └── robots.txt
├── src/
│   ├── components/           # React components
│   │   ├── ui/              # shadcn/ui components
│   │   └── NavLink.tsx      # Custom components
│   ├── hooks/               # Custom React hooks
│   ├── integrations/
│   │   └── supabase/        # Supabase client and types
│   ├── lib/                 # Utility functions
│   ├── pages/               # Route pages
│   │   ├── Index.tsx        # Home page
│   │   ├── Auth.tsx         # Login/signup page
│   │   └── NotFound.tsx     # 404 page
│   ├── App.tsx              # Root component
│   ├── index.css            # Global styles
│   └── main.tsx             # Entry point
├── supabase/
│   ├── functions/           # Edge functions (to be added)
│   ├── migrations/          # Database migrations
│   └── config.toml          # Supabase configuration
├── .env                     # Environment variables (auto-managed)
├── .gitignore              # Git ignore rules
├── components.json         # shadcn/ui configuration
├── eslint.config.js        # ESLint configuration
├── index.html              # HTML template
├── package.json            # Dependencies
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite configuration
└── README.md               # Project readme
```

---

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/data-upload-ui

# Make changes
# ... edit files ...

# Test locally
npm run dev

# Commit changes
git add .
git commit -m "Add data upload UI"

# Push to remote
git push origin feature/data-upload-ui
```

### 2. Database Changes

**Important**: All database changes must go through migrations.

```bash
# Create new migration
supabase migration new add_field_to_projects

# Edit migration file in supabase/migrations/
# Add your SQL changes

# Test migration locally
supabase db push

# Commit migration
git add supabase/migrations/
git commit -m "Add new field to projects table"
```

**Do NOT**:
- Edit `src/integrations/supabase/types.ts` (auto-generated)
- Manually update the database via SQL editor
- Skip migrations for schema changes

### 3. Adding Edge Functions

```bash
# Create new function
mkdir supabase/functions/my-function
touch supabase/functions/my-function/index.ts

# Add function code
# ... edit index.ts ...

# Update config.toml
# Add function to [functions] section

# Test locally
supabase functions serve my-function

# Deploy (automatic with Lovable Cloud)
# No manual deployment needed
```

### 4. UI Component Development

```bash
# Use shadcn/ui for base components
npx shadcn-ui@latest add button

# Create custom component
touch src/components/MyComponent.tsx

# Import and use
# import { MyComponent } from "@/components/MyComponent"
```

---

## Code Style & Best Practices

### TypeScript

```typescript
// ✅ Good: Explicit types
interface Project {
  id: string;
  name: string;
  created_at: Date;
}

const project: Project = {
  id: '123',
  name: 'My Project',
  created_at: new Date()
};

// ❌ Bad: Implicit any
const project = {
  id: '123',
  name: 'My Project'
};
```

### React Components

```typescript
// ✅ Good: Functional component with TypeScript
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick, disabled = false }) => {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
};

// ❌ Bad: No types, inline styles
export const Button = ({ label, onClick }) => {
  return <button style={{color: 'blue'}} onClick={onClick}>{label}</button>;
};
```

### Supabase Queries

```typescript
// ✅ Good: Error handling, type safety
const { data: projects, error } = await supabase
  .from('projects')
  .select('*')
  .eq('workspace_id', workspaceId);

if (error) {
  console.error('Failed to fetch projects:', error);
  toast.error('Failed to load projects');
  return;
}

// ❌ Bad: No error handling
const { data: projects } = await supabase
  .from('projects')
  .select('*');
```

### Styling

```typescript
// ✅ Good: Tailwind classes, semantic tokens
<div className="bg-background text-foreground p-4 rounded-lg">
  <h2 className="text-xl font-semibold">Title</h2>
</div>

// ❌ Bad: Inline styles, hardcoded colors
<div style={{backgroundColor: '#fff', color: '#000', padding: '16px'}}>
  <h2 style={{fontSize: '20px'}}>Title</h2>
</div>
```

---

## Testing

### Manual Testing Checklist

For each feature:
- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Responsive on mobile
- [ ] Keyboard accessible
- [ ] Screen reader friendly
- [ ] Error states handled
- [ ] Loading states shown
- [ ] Success feedback provided

### Testing Database Changes

```bash
# Apply migration
supabase db push

# Test in browser
npm run dev

# Verify RLS policies work
# Try to access data as different users

# Rollback if needed
supabase db reset
```

### Testing Edge Functions

```bash
# Serve function locally
supabase functions serve my-function

# Test with curl
curl -X POST http://localhost:54321/functions/v1/my-function \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Check logs
# Logs appear in terminal
```

---

## Debugging

### Browser DevTools

```typescript
// Add debug logs
console.log('User data:', user);
console.table(projects);

// Add breakpoints in DevTools Sources panel
debugger;

// Check network requests in Network tab
// Check console errors in Console tab
```

### Supabase Logs

```bash
# View real-time logs
supabase functions logs my-function --tail

# Filter by level
supabase functions logs my-function --level error
```

### Database Queries

```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'projects';

-- Test RLS as user
SET LOCAL role TO 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub": "user-id-here"}';
SELECT * FROM projects;
```

---

## Common Issues

### Issue: "Module not found"

**Cause**: Import path incorrect  
**Fix**: Use `@/` alias for src imports

```typescript
// ✅ Correct
import { supabase } from "@/integrations/supabase/client";

// ❌ Wrong
import { supabase } from "../../../integrations/supabase/client";
```

### Issue: RLS policy blocking query

**Cause**: User doesn't have permission  
**Fix**: Check RLS policies, ensure user is authenticated

```typescript
// Check if user is logged in
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  console.error('User not authenticated');
  return;
}
```

### Issue: "Cannot read property of undefined"

**Cause**: Data not loaded yet  
**Fix**: Add loading state and optional chaining

```typescript
// ✅ Good
if (isLoading) return <div>Loading...</div>;
if (!project) return <div>Project not found</div>;

// ❌ Bad
<div>{project.name}</div> // Crashes if project is undefined
```

---

## Performance Optimization

### Query Optimization

```typescript
// ✅ Good: Select only needed columns
const { data } = await supabase
  .from('projects')
  .select('id, name, created_at')
  .eq('workspace_id', workspaceId);

// ❌ Bad: Select all columns
const { data } = await supabase
  .from('projects')
  .select('*');
```

### Image Optimization

```typescript
// ✅ Good: Lazy loading, responsive images
<img 
  src={imageUrl} 
  alt="Description" 
  loading="lazy"
  srcSet={`${imageUrl}?w=400 400w, ${imageUrl}?w=800 800w`}
/>

// ❌ Bad: No optimization
<img src={imageUrl} />
```

### Component Optimization

```typescript
// ✅ Good: Memoization for expensive operations
const expensiveValue = useMemo(() => {
  return projects.filter(p => p.status === 'active');
}, [projects]);

// ✅ Good: Prevent unnecessary re-renders
const handleClick = useCallback(() => {
  doSomething();
}, [dependency]);

// ❌ Bad: Recreated on every render
const handleClick = () => {
  doSomething();
};
```

---

## Git Workflow

### Branch Naming

- `feature/` - New features (e.g., `feature/data-upload`)
- `fix/` - Bug fixes (e.g., `fix/auth-redirect`)
- `docs/` - Documentation (e.g., `docs/api-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/query-hooks`)

### Commit Messages

```bash
# ✅ Good: Clear, descriptive
git commit -m "Add CSV upload with drag-and-drop"
git commit -m "Fix: Prevent duplicate file uploads"
git commit -m "Refactor: Extract file validation logic"

# ❌ Bad: Vague
git commit -m "updates"
git commit -m "fix bug"
git commit -m "wip"
```

### Pull Request Process

1. Create feature branch
2. Make changes and commit
3. Push to remote
4. Create pull request on GitHub
5. Request review (if team)
6. Merge after approval
7. Delete branch

---

## Deployment

### Automatic Deployment

Lovable Cloud automatically deploys:
- **Frontend**: On every push to main branch
- **Edge Functions**: Automatically deployed with code
- **Database Migrations**: Applied automatically

### Manual Checks Before Deploy

- [ ] All tests pass locally
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Database migrations applied
- [ ] Environment variables updated (if needed)
- [ ] README updated (if needed)

---

## Environment Management

### Development Environment
- Local Vite dev server
- Points to Lovable Cloud Supabase project
- Hot module replacement enabled

### Staging Environment
- Lovable preview deployment
- Separate database (future)
- Safe for testing

### Production Environment
- Lovable production deployment
- Production database
- Custom domain (future)
- Monitoring enabled

---

## Security Best Practices

### Never Commit Secrets

```bash
# ✅ Good: Use environment variables
const apiKey = import.meta.env.VITE_API_KEY;

# ❌ Bad: Hardcoded secrets
const apiKey = "sk_live_abc123";
```

### Validate User Input

```typescript
// ✅ Good: Zod validation
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100)
});

const result = schema.safeParse(formData);
if (!result.success) {
  console.error(result.error);
  return;
}

// ❌ Bad: No validation
const { email, name } = formData;
```

### Use RLS Policies

```sql
-- ✅ Good: Restrict access with RLS
CREATE POLICY "Users can view own projects"
ON projects FOR SELECT
USING (workspace_id = get_user_workspace_id(auth.uid()));

-- ❌ Bad: No RLS
CREATE POLICY "Anyone can view"
ON projects FOR SELECT
USING (true);
```

---

## Monitoring & Logging

### Client-Side Error Tracking

```typescript
// Log errors to console (dev)
// Will add Sentry integration later
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

// Log unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
```

### Server-Side Logging

```typescript
// Edge function logging
console.log('[function-name] Info message', { context });
console.error('[function-name] Error message', { error });

// Structured logging
console.log(JSON.stringify({
  level: 'info',
  function: 'parse-csv',
  message: 'File parsed successfully',
  rowCount: 150,
  timestamp: new Date().toISOString()
}));
```

---

## Documentation Updates

When making changes:
1. Update relevant doc files in `docs/`
2. Keep code comments up to date
3. Document breaking changes in commit message
4. Update README if user-facing

---

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Lint code

# Supabase
supabase start           # Start local Supabase
supabase stop            # Stop local Supabase
supabase status          # Check status
supabase db push         # Push migrations
supabase db reset        # Reset database
supabase functions serve # Serve edge functions locally

# Git
git status               # Check status
git log --oneline        # View commit history
git branch               # List branches
git checkout -b name     # Create new branch
git merge branch-name    # Merge branch
```

---

## Resources

### Documentation
- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Vite Docs](https://vitejs.dev)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui Docs](https://ui.shadcn.com)

### Tools
- [VS Code](https://code.visualstudio.com)
- [Postman](https://www.postman.com) (API testing)
- [Figma](https://www.figma.com) (Design)

### Communities
- [Lovable Discord](https://discord.gg/lovable)
- [Supabase Discord](https://discord.supabase.com)
- [React Discord](https://discord.gg/react)

---

## Getting Help

1. Check this documentation
2. Search in docs/ folder
3. Check Supabase logs
4. Ask in Lovable Discord
5. Google the error message
6. Check GitHub issues

---

## Next Steps

1. Read PRODUCT_OVERVIEW.md for context
2. Review ARCHITECTURE.md to understand the system
3. Check ROADMAP.md for current priorities
4. Start with simple bug fixes to get familiar
5. Move to feature development when ready

---

**Happy coding! 🚀**
