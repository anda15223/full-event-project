import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Mail, CheckSquare, Settings,
  MessageCircle, Users, Flame, FileText, Cpu, PanelLeft, Home,
  Bot, ListTodo, Receipt, AlertTriangle,
} from "lucide-react";
import { useLocation } from "react-router-dom";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Mail, label: "Email Inbox", path: "/emails" },
  { icon: MessageCircle, label: "WhatsApp", path: "/whatsapp" },
  { icon: Users, label: "Employees", path: "/employees" },
  { icon: CheckSquare, label: "Task Board", path: "/tasks" },
  { icon: FileText, label: "Invoices", path: "/invoices" },
  { icon: Flame, label: "Priority Matrix", path: "/priority" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const agentItems = [
  { icon: Bot, label: "Agent Inbox", path: "/agent/inbox" },
  { icon: ListTodo, label: "Agent Tasks", path: "/agent/tasks" },
  { icon: Receipt, label: "Agent Invoices", path: "/agent/invoices" },
  { icon: AlertTriangle, label: "Review Queue", path: "/agent/review" },
];

function SidebarNav() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="h-16 justify-center">
        <div className="flex items-center gap-3 px-2 w-full">
          <button
            onClick={toggleSidebar}
            className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors shrink-0"
          >
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Cpu className="h-5 w-5 text-primary shrink-0" />
              <span className="font-heading font-semibold tracking-tight truncate text-foreground">
                AI Suite
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarMenu className="px-2 py-1">
          {menuItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <NavLink
                    to={item.path}
                    className="h-10 transition-all font-normal"
                    activeClassName="bg-sidebar-accent text-primary font-medium"
                  >
                    <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {/* Email Agent Section */}
        <div className="px-3 mt-4 pt-4 border-t border-border">
          {!isCollapsed && (
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
              Email Agent
            </p>
          )}
        </div>
        <SidebarMenu className="px-2">
          {agentItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <NavLink
                    to={item.path}
                    className="h-10 transition-all font-normal"
                    activeClassName="bg-sidebar-accent text-primary font-medium"
                  >
                    <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to Home">
              <NavLink to="/" className="h-10 transition-all font-normal" activeClassName="">
                <Home className="h-4 w-4" />
                {!isCollapsed && <span>Back to Home</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SidebarNav />
        <SidebarInset>
          <header className="h-14 flex items-center border-b border-border bg-background/95 backdrop-blur px-4 sticky top-0 z-40">
            <SidebarTrigger className="mr-4 md:hidden" />
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent status-blink" />
              <span className="text-xs font-mono text-muted-foreground">SYSTEM ONLINE</span>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
