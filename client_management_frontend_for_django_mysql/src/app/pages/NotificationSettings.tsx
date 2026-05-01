import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Bell, Volume2, VolumeX, RotateCcw, Play } from "lucide-react";
import { playNotificationSound } from "../utils/notificationSounds";
import { NotificationSound } from "../types";

export function NotificationSettings() {
  const { settings, updateSettings } = useApp();
  const [isTesting, setIsTesting] = useState(false);

  const notificationSettings = settings.notifications || {
    enabled: true,
    volume: 80,
    repeat: true,
    sound: "default",
  };

  const handleToggleEnabled = () => {
    updateSettings({
      ...settings,
      notifications: {
        ...notificationSettings,
        enabled: !notificationSettings.enabled,
      },
    });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value);
    updateSettings({
      ...settings,
      notifications: {
        ...notificationSettings,
        volume,
      },
    });
  };

  const handleToggleRepeat = () => {
    updateSettings({
      ...settings,
      notifications: {
        ...notificationSettings,
        repeat: !notificationSettings.repeat,
      },
    });
  };

  const handleSoundChange = (sound: NotificationSound) => {
    updateSettings({
      ...settings,
      notifications: {
        ...notificationSettings,
        sound,
      },
    });
  };

  const handleTestSound = () => {
    setIsTesting(true);
    playNotificationSound(notificationSettings.sound, notificationSettings.volume);
    setTimeout(() => setIsTesting(false), 1000);
  };

  const handleResetToDefault = () => {
    updateSettings({
      ...settings,
      notifications: {
        enabled: true,
        volume: 70,
        repeat: true,
        sound: "default",
      },
    });
  };

  const soundOptions: { value: NotificationSound; label: string; description: string }[] = [
    { value: "default", label: "Par défaut", description: "Son doux et discret" },
    { value: "beep", label: "Bip", description: "Signal court et aigu" },
    { value: "chime", label: "Carillon", description: "Mélodie harmonieuse" },
    { value: "bell", label: "Cloche", description: "Sonnerie prolongée" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Paramètres de notification</h1>
        <p className="text-gray-600 mt-1">
          Configurez les alertes sonores pour les sessions expirées
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Activation/Désactivation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Activation des notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base font-medium">
                  Alertes sonores
                </Label>
                <p className="text-sm text-gray-500">
                  Recevoir une notification sonore lorsqu'une session expire
                </p>
              </div>
              <button
                onClick={handleToggleEnabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notificationSettings.enabled ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notificationSettings.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Volume */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {notificationSettings.volume > 0 ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
              Volume de la sonnerie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="volume-slider">Volume: {notificationSettings.volume}%</Label>
                <span className="text-sm text-gray-500">
                  {notificationSettings.volume === 0 && "Muet"}
                  {notificationSettings.volume > 0 && notificationSettings.volume <= 30 && "Faible"}
                  {notificationSettings.volume > 30 && notificationSettings.volume <= 70 && "Moyen"}
                  {notificationSettings.volume > 70 && "Fort"}
                </span>
              </div>
              <input
                id="volume-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={notificationSettings.volume}
                onChange={handleVolumeChange}
                disabled={!notificationSettings.enabled}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Répétition */}
        <Card>
          <CardHeader>
            <CardTitle>Mode de répétition</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base font-medium">
                  Répéter jusqu'à confirmation
                </Label>
                <p className="text-sm text-gray-500">
                  La sonnerie se répète toutes les 2 secondes jusqu'à ce que la session soit terminée
                </p>
              </div>
              <button
                onClick={handleToggleRepeat}
                disabled={!notificationSettings.enabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  notificationSettings.repeat ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notificationSettings.repeat ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Choix de la sonnerie */}
        <Card>
          <CardHeader>
            <CardTitle>Type de sonnerie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {soundOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => handleSoundChange(option.value)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  notificationSettings.sound === option.value
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                } ${!notificationSettings.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 ${
                          notificationSettings.sound === option.value
                            ? "border-blue-600 bg-blue-600"
                            : "border-gray-300"
                        } flex items-center justify-center`}
                      >
                        {notificationSettings.sound === option.value && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <Label className="text-base font-medium cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 ml-6">
                      {option.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      playNotificationSound(option.value, notificationSettings.volume);
                    }}
                    disabled={!notificationSettings.enabled}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleTestSound}
                disabled={!notificationSettings.enabled || isTesting}
                className="flex-1 sm:flex-none"
              >
                <Play className="w-4 h-4 mr-2" />
                {isTesting ? "Test en cours..." : "Tester la sonnerie"}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetToDefault}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Paramètres par défaut
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Informations */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Bell className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">À propos des notifications</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>Les notifications se déclenchent uniquement pour les sessions en mode compte à rebours</li>
                  <li>Le son se joue automatiquement lorsque le temps planifié est écoulé</li>
                  <li>En mode répétition, la sonnerie continue jusqu'à la fin de la session</li>
                  <li>Vos préférences sont sauvegardées automatiquement</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
