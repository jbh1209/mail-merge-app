import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import EditorPlayground from "./pages/EditorPlayground";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectNew from "./pages/ProjectNew";
import ProjectDetail from "./pages/ProjectDetail";
import Settings from "./pages/Settings";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import AppLayout from "./components/AppLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import SubscriptionTiers from "./pages/admin/SubscriptionTiers";
import AdminUsers from "./pages/admin/Users";
import AdminWorkspaces from "./pages/admin/Workspaces";
import AdminProjects from "./pages/admin/Projects";
import AdminJobs from "./pages/admin/Jobs";
import AdminAnalytics from "./pages/admin/Analytics";
// import EditorV2Demo from "./pages/EditorV2Demo";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/editor-playground" element={<EditorPlayground />} />
          // <Route path="/editor-v2" element={<EditorV2Demo />} />
          <Route path="/auth" element={<Auth />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/new" element={<ProjectNew />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/settings" element={<Settings />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/subscription-tiers" element={<AdminRoute><SubscriptionTiers /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/workspaces" element={<AdminRoute><AdminWorkspaces /></AdminRoute>} />
            <Route path="/admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />
            <Route path="/admin/jobs" element={<AdminRoute><AdminJobs /></AdminRoute>} />
            <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
