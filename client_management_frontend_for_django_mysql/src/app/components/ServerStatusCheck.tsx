import { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { BASE_URL, pingBackend } from "../utils/api";

export function ServerStatusCheck() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const online = await pingBackend();
      if (!mounted) return;
      setStatus(online ? "online" : "offline");
    };
    check();
    const interval = setInterval(check, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const badge = status === "checking"
    ? <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Vérification...</Badge>
    : status === "online"
      ? <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Backend connecté</Badge>
      : <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Backend indisponible</Badge>;

  return (
    <Card className="mb-6">
      <CardContent className="py-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-gray-900">État de l’API Django</p>
          <p className="text-sm text-gray-500">Base URL : {BASE_URL}</p>
        </div>
        {badge}
      </CardContent>
    </Card>
  );
}
