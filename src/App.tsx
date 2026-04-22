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
import KpiLedger from "./pages/KpiLedger";
import FestivalsList from "./pages/festival/FestivalsList";
import FestivalOverview from "./pages/festival/FestivalOverview";
import SectionEditor from "./pages/festival/SectionEditor";
import ConceptsEditor from "./pages/festival/ConceptsEditor";
import StaffingEditor from "./pages/festival/StaffingEditor";
import TimelineEditor from "./pages/festival/TimelineEditor";
import TransportEditor from "./pages/festival/TransportEditor";
import TrolleysEditor from "./pages/festival/TrolleysEditor";
import FestivalReport from "./pages/festival/FestivalReport";
import AdminSections from "./pages/festival/AdminSections";

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
          <Route path="/kpi-ledger" element={<DashboardLayout><KpiLedger /></DashboardLayout>} />
          <Route path="/cashflow" element={<DashboardLayout><CashflowPage /></DashboardLayout>} />
          <Route path="/festivals" element={<DashboardLayout><FestivalsList /></DashboardLayout>} />
          <Route path="/festivals/:slug" element={<DashboardLayout><FestivalOverview /></DashboardLayout>} />
          <Route path="/festivals/:slug/section/:sectionKey" element={<DashboardLayout><SectionEditor /></DashboardLayout>} />
          <Route path="/festivals/:slug/concepts" element={<DashboardLayout><ConceptsEditor /></DashboardLayout>} />
          <Route path="/festivals/:slug/staffing" element={<DashboardLayout><StaffingEditor /></DashboardLayout>} />
          <Route path="/festivals/:slug/timeline" element={<DashboardLayout><TimelineEditor /></DashboardLayout>} />
          <Route path="/festivals/:slug/transport" element={<DashboardLayout><TransportEditor /></DashboardLayout>} />
          <Route path="/festivals/:slug/trolleys" element={<DashboardLayout><TrolleysEditor /></DashboardLayout>} />
          <Route path="/festivals/:slug/report" element={<DashboardLayout><FestivalReport /></DashboardLayout>} />
          <Route path="/admin/sections" element={<DashboardLayout><AdminSections /></DashboardLayout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
