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
import SettingsPage from "./pages/SettingsPage";
import FestivalsList from "./pages/festival/FestivalsList";
import FestivalOverview from "./pages/festival/FestivalOverview";
import FestivalOverviewExport from "./pages/festival/FestivalOverviewExport";
import FestivalAttention from "./pages/festival/FestivalAttention";
import FestivalTransport from "./pages/festival/FestivalTransport";
import FestivalTransportExport from "./pages/festival/FestivalTransportExport";
import FestivalCooling from "./pages/festival/FestivalCooling";
import FestivalCoolingExport from "./pages/festival/FestivalCoolingExport";
import FestivalPower from "./pages/festival/FestivalPower";
import FestivalPowerExport from "./pages/festival/FestivalPowerExport";
import FestivalActions from "./pages/festival/FestivalActions";
import FestivalActionsExport from "./pages/festival/FestivalActionsExport";
import FestivalContacts from "./pages/festival/FestivalContacts";
import FestivalContactsExport from "./pages/festival/FestivalContactsExport";
import ConceptTest from "./pages/festival/ConceptTest";
import GlobalAttention from "./pages/GlobalAttention";
import GlobalActions from "./pages/GlobalActions";
import ConceptGridVerify from "./pages/admin/ConceptGridVerify";
import EquipmentSeed from "./pages/admin/EquipmentSeed";

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
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="/festivals" element={<Protected><FestivalsList /></Protected>} />
            <Route path="/festivals/:slug" element={<Protected><FestivalOverview /></Protected>} />
            <Route path="/festivals/:slug/export" element={<Protected><FestivalOverviewExport /></Protected>} />
            <Route path="/festivals/:slug/attention" element={<Protected><FestivalAttention /></Protected>} />
            <Route path="/festivals/:slug/transport" element={<Protected><FestivalTransport /></Protected>} />
            <Route path="/festivals/:slug/transport/export" element={<Protected><FestivalTransportExport /></Protected>} />
            <Route path="/festivals/:slug/cooling" element={<Protected><FestivalCooling /></Protected>} />
            <Route path="/festivals/:slug/cooling/export" element={<Protected><FestivalCoolingExport /></Protected>} />
            <Route path="/festivals/:slug/power" element={<Protected><FestivalPower /></Protected>} />
            <Route path="/festivals/:slug/power/export" element={<Protected><FestivalPowerExport /></Protected>} />
            <Route path="/festivals/:slug/actions" element={<Protected><FestivalActions /></Protected>} />
            <Route path="/festivals/:slug/actions/export" element={<Protected><FestivalActionsExport /></Protected>} />
            <Route path="/festivals/:slug/contacts" element={<Protected><FestivalContacts /></Protected>} />
            <Route path="/festivals/:slug/contacts/export" element={<Protected><FestivalContactsExport /></Protected>} />
            <Route path="/festivals/:slug/concept-test" element={<Protected><ConceptTest /></Protected>} />
            <Route path="/attention" element={<Protected><GlobalAttention /></Protected>} />
            <Route path="/actions" element={<Protected><GlobalActions /></Protected>} />
            <Route path="/admin/concept-grid-verify" element={<Protected><ConceptGridVerify /></Protected>} />
            <Route path="/admin/equipment-seed" element={<Protected><EquipmentSeed /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
