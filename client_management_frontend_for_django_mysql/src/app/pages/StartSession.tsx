import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Wifi, Gamepad2, Clock, Timer, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ServiceType, SessionType } from "../types";

export function StartSession() {
  const navigate = useNavigate();
  const { addSession, getNextServiceName } = useApp();

  const [clientName, setClientName] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("wifi");
  const [sessionType, setSessionType] = useState<SessionType>("open");
  const [plannedDuration, setPlannedDuration] = useState<number>(60);
  const [loading, setLoading] = useState(false);

  const serviceName = getNextServiceName(serviceType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Generate automatic client name if empty
    let finalClientName = clientName.trim();
    if (!finalClientName) {
      const randomNumber = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
      finalClientName = `ticket-${randomNumber}`;
    }

    if (sessionType === "countdown" && (!plannedDuration || plannedDuration <= 0)) {
      toast.error("Veuillez entrer une durée valide");
      return;
    }

    setLoading(true);

    try {
      await addSession({
        clientName: finalClientName,
        serviceType,
        serviceName,
        sessionType,
        plannedDuration: sessionType === "countdown" ? plannedDuration : null,
      });

      toast.success(`Session ${serviceName} démarrée avec succès !`);
      navigate("/active");
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Erreur lors de la création de la session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Nouvelle session</h1>
        <p className="text-gray-600 mt-1">Démarrer une session pour un client</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations de la session</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Client name */}
            <div className="space-y-2">
              <Label htmlFor="clientName">Nom du client (optionnel)</Label>
              <Input
                id="clientName"
                placeholder="Ex: Jean Dupont (laissez vide pour génération auto)"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
              <p className="text-sm text-gray-500">
                Si vide, un nom sera généré automatiquement (ex: ticket-1234)
              </p>
            </div>

            {/* Service type */}
            <div className="space-y-3">
              <Label>Type de service</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={`relative flex items-center space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                    serviceType === "wifi"
                      ? "border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-105"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                  }`}
                  onClick={() => setServiceType("wifi")}
                >
                  {serviceType === "wifi" && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="w-6 h-6 text-blue-600 animate-in zoom-in duration-300" />
                    </div>
                  )}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        serviceType === "wifi" 
                          ? "bg-blue-500 shadow-lg" 
                          : "bg-gray-100"
                      }`}
                    >
                      <Wifi className={`w-7 h-7 transition-colors duration-300 ${serviceType === "wifi" ? "text-white" : "text-gray-600"}`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-base font-semibold cursor-pointer transition-colors duration-300 ${
                        serviceType === "wifi" ? "text-blue-700" : "text-gray-900"
                      }`}
                    >
                      Wifi
                    </div>
                    <p className={`text-sm transition-colors duration-300 ${
                      serviceType === "wifi" ? "text-blue-600" : "text-gray-500"
                    }`}>Connexion internet</p>
                  </div>
                </div>

                <div
                  className={`relative flex items-center space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                    serviceType === "console"
                      ? "border-purple-600 bg-gradient-to-br from-purple-50 to-purple-100 shadow-lg scale-105"
                      : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
                  }`}
                  onClick={() => setServiceType("console")}
                >
                  {serviceType === "console" && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="w-6 h-6 text-purple-600 animate-in zoom-in duration-300" />
                    </div>
                  )}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        serviceType === "console" 
                          ? "bg-purple-500 shadow-lg" 
                          : "bg-gray-100"
                      }`}
                    >
                      <Gamepad2
                        className={`w-7 h-7 transition-colors duration-300 ${serviceType === "console" ? "text-white" : "text-gray-600"}`}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-base font-semibold cursor-pointer transition-colors duration-300 ${
                        serviceType === "console" ? "text-purple-700" : "text-gray-900"
                      }`}
                    >
                      Console
                    </div>
                    <p className={`text-sm transition-colors duration-300 ${
                      serviceType === "console" ? "text-purple-600" : "text-gray-500"
                    }`}>PS5, Xbox, etc.</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Nom du service :</span>{" "}
                  <span className="text-blue-600 font-bold text-base">{serviceName}</span>
                </p>
              </div>
            </div>

            {/* Session type */}
            <div className="space-y-3">
              <Label>Mode de session</Label>
              <div className="space-y-3">
                <div
                  className={`relative flex items-start space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${
                    sessionType === "open"
                      ? "border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-[1.02]"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                  }`}
                  onClick={() => setSessionType("open")}
                >
                  {sessionType === "open" && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="w-6 h-6 text-blue-600 animate-in zoom-in duration-300" />
                    </div>
                  )}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        sessionType === "open" 
                          ? "bg-blue-500 shadow-md" 
                          : "bg-gray-100"
                      }`}
                    >
                      <Clock className={`w-6 h-6 transition-colors duration-300 ${
                        sessionType === "open" ? "text-white" : "text-gray-600"
                      }`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className={`text-base font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-300 ${
                      sessionType === "open" ? "text-blue-700" : "text-gray-900"
                    }`}>
                      Session ouverte
                    </div>
                    <p className={`text-sm mt-1 transition-colors duration-300 ${
                      sessionType === "open" ? "text-blue-600" : "text-gray-500"
                    }`}>
                      Compteur libre, sans limite de temps. Le chronomètre compte à partir de 0.
                    </p>
                  </div>
                </div>

                <div
                  className={`relative flex items-start space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${
                    sessionType === "countdown"
                      ? "border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-[1.02]"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                  }`}
                  onClick={() => setSessionType("countdown")}
                >
                  {sessionType === "countdown" && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="w-6 h-6 text-blue-600 animate-in zoom-in duration-300" />
                    </div>
                  )}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        sessionType === "countdown" 
                          ? "bg-blue-500 shadow-md" 
                          : "bg-gray-100"
                      }`}
                    >
                      <Timer
                        className={`w-6 h-6 transition-colors duration-300 ${
                          sessionType === "countdown" ? "text-white" : "text-gray-600"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div
                      className={`text-base font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-300 ${
                        sessionType === "countdown" ? "text-blue-700" : "text-gray-900"
                      }`}
                    >
                      Compte à rebours
                    </div>
                    <p className={`text-sm mt-1 transition-colors duration-300 ${
                      sessionType === "countdown" ? "text-blue-600" : "text-gray-500"
                    }`}>
                      Définir une durée prévue. Le temps décompte et une alerte se déclenche à 0.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Planned duration (countdown only) */}
            {sessionType === "countdown" && (
              <div className="space-y-2">
                <Label htmlFor="plannedDuration">Durée prévue (minutes)</Label>
                <Input
                  id="plannedDuration"
                  type="number"
                  min="1"
                  value={plannedDuration}
                  onChange={(e) => setPlannedDuration(Number(e.target.value))}
                  placeholder="Ex: 60"
                  required
                />
                <p className="text-sm text-gray-500">
                  Une notification sonore sera déclenchée lorsque le temps sera écoulé
                </p>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/active")}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "Démarrage..." : "Démarrer la session"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}