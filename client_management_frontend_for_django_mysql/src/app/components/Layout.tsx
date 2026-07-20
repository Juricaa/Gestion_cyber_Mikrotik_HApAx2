import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Monitor, Gamepad2, History, Settings, User, ShieldCheck, LogOut, BarChart3, Bell, Archive, ShoppingCart, Loader2, UserCog, ListVideo, Database } from "lucide-react";
import { cn } from "./ui/utils";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";

function LoginScreen({
  onLogin,
  loading,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  loading: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(username, password);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <Gamepad2 className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl">Cyber Manager</h1>
            <p className="text-sm text-gray-500">Connexion au backend Django</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Nom d'utilisateur</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connexion...</> : "Se connecter"}
          </Button>
        </form>

      </div>
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, loading, login, logout } = useAuth();

  const roleLabel = isAdmin ? "Administrateur" : user?.role === "staff" ? "Staff" : "Utilisateur";
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isAdmin) {
      const restrictedPaths = ["/", "/start", "/settings", "/archives", "/analytics", "/users"];
      if (restrictedPaths.includes(location.pathname)) {
        navigate("/active");
      }
    }
  }, [isAuthenticated, isAdmin, location.pathname, navigate]);

  const userNavItems = [
    { path: "/active", icon: Monitor, label: "Sessions actives" },
    { path: "/sales", icon: ShoppingCart, label: "Ventes produits" },
    { path: "/sales-history", icon: ListVideo, label: "Historique achats" },
    { path: "/history", icon: History, label: "Historique sessions" },
    { path: "/backups", icon: Database, label: "Sauvegardes" },
    { path: "/notifications", icon: Bell, label: "Notifications" },
  ];

  const adminNavItems = [
    { path: "/", icon: BarChart3, label: "Tableau de bord" },
    { path: "/active", icon: Monitor, label: "Sessions actives" },
    { path: "/sales", icon: ShoppingCart, label: "Ventes produits" },
    { path: "/sales-history", icon: ListVideo, label: "Historique achats" },
    { path: "/history", icon: History, label: "Historique sessions" },
    { path: "/backups", icon: Database, label: "Sauvegardes" },
    { path: "/archives", icon: Archive, label: "Archives" },
    { path: "/settings", icon: Settings, label: "Paramètres" },
    { path: "/users", icon: UserCog, label: "Utilisateurs" },
    { path: "/notifications", icon: Bell, label: "Notifications" },
  ];

  const navItems = isAdmin ? adminNavItems : userNavItems;

  const handleLogin = async (username: string, password: string) => {
    setSubmitting(true);
    try {
      const ok = await login(username, password);
      if (!ok) {
        toast.error("Identifiants invalides");
        return;
      }
      toast.success("Connexion réussie");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Déconnexion réussie");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
          <p className="text-gray-600">Connexion au backend...</p>
        </div>
      </div>
    );
  }


  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        loading={submitting}
      />
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Cyber Manager</h1>
              <p className="text-sm text-gray-500">Django + MySQL Backend</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="space-y-3">
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border",
              isAdmin ? "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200" : "bg-gray-50 border-gray-200",
            )}>
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                isAdmin ? "bg-blue-600" : "bg-gray-300",
              )}>
                {isAdmin ? <ShieldCheck className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-gray-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{user?.full_name || user?.username}</p>
                <p className="text-xs text-gray-500">{roleLabel}</p>
              </div>
            </div>
            <Button onClick={handleLogout} variant="outline" className="w-full justify-start text-gray-700">
              <LogOut className="w-4 h-4 mr-2" />
              Se déconnecter
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
