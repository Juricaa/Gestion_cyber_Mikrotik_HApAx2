import { createBrowserRouter } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Analytics } from "./pages/Analytics";
import { StartSession } from "./pages/StartSession";
import { ActiveSessions } from "./pages/ActiveSessions";
import { History } from "./pages/History";
import { Archives } from "./pages/Archives";
import { Settings } from "./pages/Settings";
import { NotificationSettings } from "./pages/NotificationSettings";
import { FilmSales } from "./pages/FilmSales";
import { UserManagement } from "./pages/UserManagement";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      { 
        path: "analytics", 
        element: (
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        ),
      },
      { 
        path: "start", 
        element: (
          <ProtectedRoute adminOnly>
            <StartSession />
          </ProtectedRoute>
        ),
      },
      { path: "active", element: <ActiveSessions /> },
      { path: "sales", element: <FilmSales /> },
      { path: "history", element: <History /> },
      { 
        path: "archives", 
        element: (
          <ProtectedRoute adminOnly>
            <Archives />
          </ProtectedRoute>
        ),
      },
      { 
        path: "settings", 
        element: (
          <ProtectedRoute adminOnly>
            <Settings />
          </ProtectedRoute>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute adminOnly>
            <UserManagement />
          </ProtectedRoute>
        ),
      },
      { path: "notifications", element: <NotificationSettings /> },
    ],
  },
]);