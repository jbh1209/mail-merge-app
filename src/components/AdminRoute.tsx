import { useAdminRole } from "@/hooks/useAdminRole";
import { Navigate } from "react-router-dom";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAdminRole();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
