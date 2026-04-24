import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/Auth";
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
import DocumentsOverview from "./pages/documents/DocumentsOverview";
import DocumentsInvoices from "./pages/documents/DocumentsInvoices";
import DocumentsFestivals from "./pages/documents/DocumentsFestivals";
import DocumentsFestivalDetail from "./pages/documents/DocumentsFestivalDetail";
import DocumentsCategoryPage from "./pages/documents/DocumentsCategoryPage";

const queryClient = new QueryClient();

const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><DashboardLayout>{children}</DashboardLayout></ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />

            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/email-memory" element={<Protected><EmailMemory /></Protected>} />
            <Route path="/emails" element={<Protected><EmailInbox /></Protected>} />
            <Route path="/tasks" element={<Protected><TaskBoard /></Protected>} />
            <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
            <Route path="/priority" element={<Protected><PriorityView /></Protected>} />
            <Route path="/whatsapp" element={<Protected><WhatsAppInbox /></Protected>} />
            <Route path="/employees" element={<Protected><Employees /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="/agent/inbox" element={<Protected><AgentInbox /></Protected>} />
            <Route path="/agent/tasks" element={<Protected><AgentTasks /></Protected>} />
            <Route path="/agent/invoices" element={<Protected><AgentInvoices /></Protected>} />
            <Route path="/agent/review" element={<Protected><AgentReviewQueue /></Protected>} />
            <Route path="/agent/operations" element={<Protected><AgentOperations /></Protected>} />
            <Route path="/agent/romania" element={<Protected><AgentRomania /></Protected>} />
            <Route path="/ledger" element={<Protected><Ledger /></Protected>} />
            <Route path="/kpi-ledger" element={<Protected><KpiLedger /></Protected>} />
            <Route path="/cashflow" element={<Protected><CashflowPage /></Protected>} />
            <Route path="/festivals" element={<Protected><FestivalsList /></Protected>} />
            <Route path="/festivals/:slug" element={<Protected><FestivalOverview /></Protected>} />
            <Route path="/festivals/:slug/section/:sectionKey" element={<Protected><SectionEditor /></Protected>} />
            <Route path="/festivals/:slug/concepts" element={<Protected><ConceptsEditor /></Protected>} />
            <Route path="/festivals/:slug/staffing" element={<Protected><StaffingEditor /></Protected>} />
            <Route path="/festivals/:slug/timeline" element={<Protected><TimelineEditor /></Protected>} />
            <Route path="/festivals/:slug/transport" element={<Protected><TransportEditor /></Protected>} />
            <Route path="/festivals/:slug/trolleys" element={<Protected><TrolleysEditor /></Protected>} />
            <Route path="/festivals/:slug/report" element={<Protected><FestivalReport /></Protected>} />
            <Route path="/admin/sections" element={<Protected><AdminSections /></Protected>} />

            {/* Documents */}
            <Route path="/documents" element={<Protected><DocumentsOverview /></Protected>} />
            <Route path="/documents/invoices" element={<Protected><DocumentsInvoices /></Protected>} />
            <Route path="/documents/festivals" element={<Protected><DocumentsFestivals /></Protected>} />
            <Route path="/documents/festivals/:slug" element={<Protected><DocumentsFestivalDetail /></Protected>} />
            <Route path="/documents/contracts" element={<Protected><DocumentsCategoryPage category="contract" title="Contracts" /></Protected>} />
            <Route path="/documents/hr" element={<Protected><DocumentsCategoryPage category="hr" title="HR documents" /></Protected>} />
            <Route path="/documents/suppliers" element={<Protected><DocumentsCategoryPage category="supplier" title="Supplier documents" /></Protected>} />
            <Route path="/documents/authority" element={<Protected><DocumentsCategoryPage category="authority" title="Authority documents" /></Protected>} />
            <Route path="/documents/other" element={<Protected><DocumentsCategoryPage category="other" title="Other documents" /></Protected>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
