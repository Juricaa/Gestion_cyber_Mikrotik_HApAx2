import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "./ui/card";
import { ShieldAlert } from "lucide-react";

export function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { isAdmin } = useAuth();

  if (adminOnly && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Accès restreint</h2>
            <p className="text-gray-600 mb-6">
              Cette page est réservée aux administrateurs du backend Django.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
