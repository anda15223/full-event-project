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
import DashboardHome from "./pages/DashboardHome";
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
import GlobalContacts from "./pages/GlobalContacts";
import GlobalQuestions from "./pages/GlobalQuestions";
import FestivalQuestions from "./pages/festival/FestivalQuestions";
import FestivalQuestionsExport from "./pages/festival/FestivalQuestionsExport";
import ConceptGridVerify from "./pages/admin/ConceptGridVerify";
import EquipmentSeed from "./pages/admin/EquipmentSeed";
import CardShellTest from "./pages/admin/CardShellTest";
import ParseTest from "./pages/admin/ParseTest";
import GlobalRules from "./pages/GlobalRules";
import RulesExport from "./pages/RulesExport";
import FestivalTimeline from "./pages/festival/FestivalTimeline";
import FestivalTimelineExport from "./pages/festival/FestivalTimelineExport";
import GlobalTimeline from "./pages/GlobalTimeline";
import FestivalContracts from "./pages/festival/FestivalContracts";
import FestivalContractsExport from "./pages/festival/FestivalContractsExport";
import ContractsOverview from "./pages/ContractsOverview";
import FestivalFacade from "./pages/festival/FestivalFacade";
import FestivalFacadeExport from "./pages/festival/FestivalFacadeExport";
import FestivalSafety from "./pages/festival/FestivalSafety";
import FestivalSafetyExport from "./pages/festival/FestivalSafetyExport";
import FestivalAccommodation from "./pages/festival/FestivalAccommodation";
import FestivalAccommodationExport from "./pages/festival/FestivalAccommodationExport";
import FestivalBinder from "./pages/festival/FestivalBinder";
import FestivalBinderExport from "./pages/festival/FestivalBinderExport";
import FestivalSoborgLoading from "./pages/festival/FestivalSoborgLoading";
import FestivalEquipment from "./pages/festival/FestivalEquipment";
import FestivalPrices from "./pages/festival/FestivalPrices";
import FestivalSoborgLoadingExport from "./pages/festival/FestivalSoborgLoadingExport";
import FestivalSetup from "./pages/festival/FestivalSetup";
import FestivalStaff from "./pages/festival/FestivalStaff";
import FestivalStaffExport from "./pages/festival/FestivalStaffExport";
import FestivalScheduling from "./pages/festival/FestivalScheduling";

import FestivalEquipmentExport from "./pages/festival/FestivalEquipmentExport";
import FestivalTrolleyLoadsExport from "./pages/festival/FestivalTrolleyLoadsExport";
import FestivalVehicleLoadsExport from "./pages/festival/FestivalVehicleLoadsExport";
import FestivalSoborgPickListExport from "./pages/festival/FestivalSoborgPickListExport";
import FestivalPricesExport from "./pages/festival/FestivalPricesExport";
import FestivalSetupExport from "./pages/festival/FestivalSetupExport";
import FestivalInfoExport from "./pages/festival/FestivalInfoExport";
import StaffDirectory from "./pages/StaffDirectory";
import CompanySettings from "./pages/crew/CompanySettings";
import FestivalCrewHire from "./pages/crew/FestivalCrewHire";
import OnboardWizard from "./pages/onboard/OnboardWizard";
import AdminRoute from "./components/crew/AdminRoute";
import OAuthConsent from "./pages/OAuthConsent";

const queryClient = new QueryClient();

const AdminProtected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><AdminRoute><DashboardLayout>{children}</DashboardLayout></AdminRoute></ProtectedRoute>
);

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
            <Route path="/onboard/:token" element={<OnboardWizard />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/" element={<Protected><DashboardHome /></Protected>} />
            <Route path="/home" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<Protected><DashboardHome /></Protected>} />
            <Route path="/dashboard-legacy" element={<Protected><Dashboard /></Protected>} />
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
            <Route path="/contacts" element={<Protected><GlobalContacts /></Protected>} />
            <Route path="/questions" element={<Protected><GlobalQuestions /></Protected>} />
            <Route path="/festivals/:slug/questions" element={<Protected><FestivalQuestions /></Protected>} />
            <Route path="/festivals/:slug/questions/export" element={<Protected><FestivalQuestionsExport /></Protected>} />
            <Route path="/admin/concept-grid-verify" element={<Protected><ConceptGridVerify /></Protected>} />
            <Route path="/admin/equipment-seed" element={<Protected><EquipmentSeed /></Protected>} />
            <Route path="/admin/card-shell-test" element={<Protected><CardShellTest /></Protected>} />
            <Route path="/admin/parse-test" element={<Protected><ParseTest /></Protected>} />
            <Route path="/rules" element={<Protected><GlobalRules /></Protected>} />
            <Route path="/rules/export" element={<Protected><RulesExport /></Protected>} />
            <Route path="/festivals/:slug/timeline" element={<Protected><FestivalTimeline /></Protected>} />
            <Route path="/festivals/:slug/timeline/export" element={<Protected><FestivalTimelineExport /></Protected>} />
            <Route path="/timeline" element={<Protected><GlobalTimeline /></Protected>} />
            <Route path="/festivals/:slug/contracts" element={<Protected><FestivalContracts /></Protected>} />
            <Route path="/festivals/:slug/contracts/export" element={<Protected><FestivalContractsExport /></Protected>} />
            <Route path="/contracts-overview" element={<Protected><ContractsOverview /></Protected>} />
            <Route path="/festivals/:slug/facade" element={<Protected><FestivalFacade /></Protected>} />
            <Route path="/festivals/:slug/facade/export" element={<Protected><FestivalFacadeExport /></Protected>} />
            <Route path="/festivals/:slug/safety" element={<Protected><FestivalSafety /></Protected>} />
            <Route path="/festivals/:slug/safety/export" element={<Protected><FestivalSafetyExport /></Protected>} />
            <Route path="/festivals/:slug/accommodation" element={<Protected><FestivalAccommodation /></Protected>} />
            <Route path="/festivals/:slug/accommodation/export" element={<Protected><FestivalAccommodationExport /></Protected>} />
            <Route path="/festivals/:slug/binder" element={<Protected><FestivalBinder /></Protected>} />
            <Route path="/festivals/:slug/binder/export" element={<Protected><FestivalBinderExport /></Protected>} />
            <Route path="/festivals/:slug/soborg-loading" element={<Protected><FestivalSoborgLoading /></Protected>} />
            <Route path="/festivals/:slug/soborg-loading/export" element={<Protected><FestivalSoborgLoadingExport /></Protected>} />
            <Route path="/festivals/:slug/equipment" element={<Protected><FestivalEquipment /></Protected>} />
            <Route path="/festivals/:slug/equipment/export" element={<Protected><FestivalEquipmentExport /></Protected>} />
            <Route path="/festivals/:slug/equipment/export/trolleys" element={<Protected><FestivalTrolleyLoadsExport /></Protected>} />
            <Route path="/festivals/:slug/equipment/export/vehicles" element={<Protected><FestivalVehicleLoadsExport /></Protected>} />
            <Route path="/festivals/:slug/equipment/export/soborg" element={<Protected><FestivalSoborgPickListExport /></Protected>} />
            <Route path="/festivals/:slug/prices" element={<Protected><FestivalPrices /></Protected>} />
            <Route path="/festivals/:slug/prices/export" element={<Protected><FestivalPricesExport /></Protected>} />
            <Route path="/festivals/:slug/setup" element={<Protected><FestivalSetup /></Protected>} />
            <Route path="/festivals/:slug/setup/export" element={<Protected><FestivalSetupExport /></Protected>} />
            <Route path="/festivals/:slug/staff" element={<Protected><FestivalStaff /></Protected>} />
            <Route path="/festivals/:slug/staff/export" element={<Protected><FestivalStaffExport /></Protected>} />
            <Route path="/festivals/:slug/scheduling" element={<Protected><FestivalScheduling /></Protected>} />
            <Route path="/festivals/:slug/crew" element={<AdminProtected><FestivalCrewHire /></AdminProtected>} />
            <Route path="/admin/company-settings" element={<AdminProtected><CompanySettings /></AdminProtected>} />
            
            <Route path="/festivals/:slug/info/export" element={<Protected><FestivalInfoExport /></Protected>} />
            <Route path="/staff" element={<Protected><StaffDirectory /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
