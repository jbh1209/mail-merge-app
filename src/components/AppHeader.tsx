import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings, User } from "lucide-react";

interface AppHeaderProps {
  isAuthenticated?: boolean;
  profile?: any;
  onSignOut?: () => void;
  showSidebarTrigger?: boolean;
}

export function AppHeader({ 
  isAuthenticated = false, 
  profile, 
  onSignOut,
  showSidebarTrigger = false 
}: AppHeaderProps) {
  const navigate = useNavigate();

  return (
    <nav className="border-b bg-background sticky top-0 z-40">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          {showSidebarTrigger && <SidebarTrigger />}
          
          <button 
            onClick={() => navigate(isAuthenticated ? "/dashboard" : "/")}
            className="flex items-center"
          >
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Mail Merge
            </h1>
          </button>
          
          {!isAuthenticated && (
            <div className="hidden md:flex space-x-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Use Cases
              </a>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {!isAuthenticated ? (
            <>
              <Button variant="ghost" onClick={() => navigate('/auth')}>
                Log In
              </Button>
              <Button onClick={() => navigate('/auth')}>
                Sign Up
              </Button>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarFallback>
                      {profile?.full_name?.charAt(0) || <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background z-50">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{profile?.full_name || "User"}</p>
                    {profile?.workspaces && (
                      <p className="text-xs text-muted-foreground">{profile.workspaces.name}</p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </nav>
  );
}
