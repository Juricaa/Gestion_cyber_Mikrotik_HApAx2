import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Analytics } from "./pages/Analytics";
import { StartSession } from "./pages/StartSession";
import { ActiveSessions } from "./pages/ActiveSessions";
import { History } from "./pages/History";
import { Archives } from "./pages/Archives";
import { Settings } from "./pages/Settings";
import { NotificationSettings } from "./pages/NotificationSettings";
import { FilmSales } from "./pages/FilmSales";
import { FilmSalesHistory } from "./pages/FilmSalesHistory";
import { UserManagement } from "./pages/UserManagement";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<ProtectedRoute adminOnly><Dashboard /></ProtectedRoute>} />
              <Route path="analytics" element={<ProtectedRoute adminOnly><Analytics /></ProtectedRoute>} />
              <Route path="start" element={<ProtectedRoute adminOnly><StartSession /></ProtectedRoute>} />
              <Route path="active" element={<ActiveSessions />} />
              <Route path="sales" element={<FilmSales />} />
              <Route path="sales-history" element={<FilmSalesHistory />} />
              <Route path="history" element={<History />} />
              <Route path="archives" element={<ProtectedRoute adminOnly><Archives /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute adminOnly><UserManagement /></ProtectedRoute>} />
              <Route path="notifications" element={<NotificationSettings />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </AppProvider>
    </AuthProvider>
  );
}
