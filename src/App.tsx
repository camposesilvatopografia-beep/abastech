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

const queryClient = new QueryClient();

function PwaEntryRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // For Field users: if the installed mobile app opens outside the field module,
    // always redirect into /apontamento (which shows the Field login when needed).
    if (isStandalone && isMobile) {
      const isInField =
        location.pathname.startsWith('/apontamento') ||
        location.pathname.startsWith('/campo');

      if (!isInField) {
        navigate('/apontamento', { replace: true });
      }
    }
  }, [location.pathname, navigate]);

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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
