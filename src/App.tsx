import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import InstallPage from "./pages/InstallPage";
import { FieldPage } from "./components/Pages/FieldPage";
import { FieldUsersPage } from "./components/Pages/FieldUsersPage";
import { InstallPrompt } from "./components/PWA/InstallPrompt";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
