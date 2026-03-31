import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import EmailInbox from "./pages/EmailInbox";
import EmailMemory from "./pages/EmailMemory";
import TaskBoard from "./pages/TaskBoard";
import Invoices from "./pages/Invoices";
import PriorityView from "./pages/PriorityView";
import WhatsAppInbox from "./pages/WhatsAppInbox";
import Employees from "./pages/Employees";
import SettingsPage from "./pages/SettingsPage";
import AgentInbox from "./pages/AgentInbox";
import AgentTasks from "./pages/AgentTasks";
import AgentInvoices from "./pages/AgentInvoices";
import AgentReviewQueue from "./pages/AgentReviewQueue";
import AgentOperations from "./pages/AgentOperations";
import AgentRomania from "./pages/AgentRomania";
import Ledger from "./pages/Ledger";
import CashflowPage from "./pages/CashflowPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
          <Route path="/email-memory" element={<DashboardLayout><EmailMemory /></DashboardLayout>} />
          <Route path="/emails" element={<DashboardLayout><EmailInbox /></DashboardLayout>} />
          <Route path="/tasks" element={<DashboardLayout><TaskBoard /></DashboardLayout>} />
          <Route path="/invoices" element={<DashboardLayout><Invoices /></DashboardLayout>} />
          <Route path="/priority" element={<DashboardLayout><PriorityView /></DashboardLayout>} />
          <Route path="/whatsapp" element={<DashboardLayout><WhatsAppInbox /></DashboardLayout>} />
          <Route path="/employees" element={<DashboardLayout><Employees /></DashboardLayout>} />
          <Route path="/settings" element={<DashboardLayout><SettingsPage /></DashboardLayout>} />
          <Route path="/agent/inbox" element={<DashboardLayout><AgentInbox /></DashboardLayout>} />
          <Route path="/agent/tasks" element={<DashboardLayout><AgentTasks /></DashboardLayout>} />
          <Route path="/agent/invoices" element={<DashboardLayout><AgentInvoices /></DashboardLayout>} />
          <Route path="/agent/review" element={<DashboardLayout><AgentReviewQueue /></DashboardLayout>} />
          <Route path="/agent/operations" element={<DashboardLayout><AgentOperations /></DashboardLayout>} />
          <Route path="/agent/romania" element={<DashboardLayout><AgentRomania /></DashboardLayout>} />
          <Route path="/ledger" element={<DashboardLayout><Ledger /></DashboardLayout>} />
          <Route path="/cashflow" element={<DashboardLayout><CashflowPage /></DashboardLayout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
