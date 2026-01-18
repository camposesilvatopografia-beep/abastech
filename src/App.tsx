import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import InstallPage from "./pages/InstallPage";
import { FieldPage } from "./components/Pages/FieldPage";
import { FieldUsersPage } from "./components/Pages/FieldUsersPage";
import { InstallPrompt } from "./components/PWA/InstallPrompt";
import { UpdatePrompt } from "./components/PWA/UpdatePrompt";

const queryClient = new QueryClient();

function PwaEntryRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      // iOS Safari standalone mode
      (navigator as any)?.standalone === true;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Mobile-first experience: on mobile devices, always keep users inside the Field module
    // (unless they are on install pages), so operators never land on the admin dashboard.
    if (isMobile) {
      const isInstallPage =
        location.pathname === '/instalar' ||
        location.pathname === '/apontamento/instalar';

      const isInField =
        location.pathname === '/apontamento' ||
        location.pathname.startsWith('/apontamento/') ||
        location.pathname === '/campo' ||
        location.pathname.startsWith('/campo/');

      // If running as installed app OR user is simply browsing on mobile,
      // force into /apontamento (FieldPage shows login when needed).
      if (!isInstallPage && !isInField) {
        window.location.replace('/apontamento');
      }
    }
  }, [location.pathname]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PwaEntryRedirect />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Index />} />
          <Route path="/instalar" element={<InstallPage />} />
          <Route path="/campo" element={<FieldPage />} />
          <Route path="/apontamento" element={<FieldPage />} />
          <Route path="/apontamento/instalar" element={<InstallPage />} />
          <Route path="/campo/usuarios" element={<FieldUsersPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <InstallPrompt />
        <UpdatePrompt />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
