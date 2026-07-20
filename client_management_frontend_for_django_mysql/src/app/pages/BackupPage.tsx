import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  BriefcaseBusiness,
  Database,
  HardDriveDownload,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useAuth } from "../context/AuthContext";
import {
  BackupFile,
  BackupHistoryEntry,
  createBackup,
  createBusinessBackup,
  deleteBackup,
  getBackups,
  restoreBackup,
  restoreBusinessBackup,
} from "../utils/api";

const humanFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

type PendingAction = {
  type: "restore_full" | "restore_business" | "delete";
  filename: string;
};

export function BackupPage() {
  const { isAdmin } = useAuth();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [backupDirAvailable, setBackupDirAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [operationLabel, setOperationLabel] = useState("Sauvegarde en cours");
  const [progress, setProgress] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [restoreMode, setRestoreMode] = useState<"replace" | "backup_before_restore">(
    "backup_before_restore",
  );

  const loadBackups = async () => {
    setLoading(true);
    try {
      const response = await getBackups();
      setBackupDirAvailable(response.backup_dir_available);
      setBackups(response.backups);
      setHistory(response.history);
    } catch (error) {
      console.error("Error loading backups:", error);
      toast.error(error instanceof Error ? error.message : "Impossible de charger les sauvegardes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBackups();
  }, []);

  useEffect(() => {
    if (!processing) return;

    setProgress(8);
    const interval = window.setInterval(() => {
      setProgress((value) => Math.min(95, value + 7));
    }, 180);

    return () => window.clearInterval(interval);
  }, [processing]);

  const finishOperation = () => {
    setProgress(100);
    window.setTimeout(() => setProgress(0), 400);
    setProcessing(false);
  };

  const handleCreateBusiness = async () => {
    setOperationLabel("Sauvegarde des sessions, tarifs et ventes");
    setProcessing(true);
    try {
      const result = await createBusinessBackup();
      toast.success(`Sauvegarde métier créée : ${result.filename}`);
      await loadBackups();
    } catch (error) {
      console.error("Error creating business backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur pendant la sauvegarde métier");
    } finally {
      finishOperation();
    }
  };

  const handleCreateFull = async () => {
    setOperationLabel("Création de la sauvegarde complète");
    setProcessing(true);
    try {
      const result = await createBackup();
      toast.success(`Sauvegarde complète créée : ${result.filename}`);
      await loadBackups();
    } catch (error) {
      console.error("Error creating full backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur pendant la sauvegarde complète");
    } finally {
      finishOperation();
    }
  };

  const handleDelete = async (filename: string) => {
    setPendingAction(null);
    setOperationLabel("Suppression de la sauvegarde");
    setProcessing(true);
    try {
      await deleteBackup(filename);
      toast.success(`Sauvegarde supprimée : ${filename}`);
      await loadBackups();
    } catch (error) {
      console.error("Error deleting backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur pendant la suppression");
    } finally {
      finishOperation();
    }
  };

  const handleRestoreFull = async (filename: string) => {
    setPendingAction(null);
    setOperationLabel("Restauration complète de la base");
    setProcessing(true);
    try {
      const result = await restoreBackup(filename, restoreMode);
      toast.success(`Restauration complète terminée : ${filename}`);
      await loadBackups();
      if (result.reload_required !== false) {
        window.setTimeout(() => window.location.reload(), 700);
      }
    } catch (error) {
      console.error("Error restoring full backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur pendant la restauration complète");
    } finally {
      finishOperation();
    }
  };

  const handleRestoreBusiness = async (filename: string) => {
    setPendingAction(null);
    setOperationLabel("Restauration des données métier");
    setProcessing(true);
    try {
      const result = await restoreBusinessBackup(filename);
      toast.success(`Sessions, tarifs et ventes restaurés : ${filename}`);
      await loadBackups();
      if (result.reload_required !== false) {
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      console.error("Error restoring business backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur pendant la restauration métier");
    } finally {
      finishOperation();
    }
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.type === "delete") {
      await handleDelete(pendingAction.filename);
      return;
    }
    if (pendingAction.type === "restore_business") {
      await handleRestoreBusiness(pendingAction.filename);
      return;
    }
    await handleRestoreFull(pendingAction.filename);
  };

  const dialogTitle =
    pendingAction?.type === "delete"
      ? "Supprimer cette sauvegarde ?"
      : pendingAction?.type === "restore_business"
        ? "Restaurer les données métier ?"
        : "Effectuer une restauration complète ?";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sauvegardes</h1>
          <p className="mt-1 text-gray-600">
            {isAdmin
              ? "Gérez les sauvegardes complètes et les sauvegardes métier."
              : "Sauvegardez et restaurez les sessions, tarifs et ventes sans modifier les comptes."}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCreateBusiness()}
            disabled={processing || !backupDirAvailable}
          >
            {processing && operationLabel.includes("sessions") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BriefcaseBusiness className="mr-2 h-4 w-4" />
            )}
            Sauvegarder les données métier
          </Button>

          {isAdmin && (
            <Button
              type="button"
              onClick={() => void handleCreateFull()}
              disabled={processing || !backupDirAvailable}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Database className="mr-2 h-4 w-4" />
              Sauvegarde complète
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6 border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div className="text-sm text-emerald-950">
            <p className="font-semibold">Sauvegarde métier partageable entre les PC</p>
            <p className="mt-1 text-emerald-800">
              Elle contient uniquement les postes, tarifs, sessions Wi-Fi/console, événements et ventes.
              Les comptes, mots de passe et paramètres MikroTik ne sont jamais inclus.
            </p>
          </div>
        </CardContent>
      </Card>

      {processing && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-900">{operationLabel}</p>
                <p className="text-sm text-blue-700">Ne fermez pas cette page avant la fin.</p>
              </div>
              <span className="text-sm text-blue-800">{progress}%</span>
            </div>
            <Progress value={progress} className="mt-4" />
          </CardContent>
        </Card>
      )}

      {!backupDirAvailable && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-start gap-3 p-5">
            <Database className="mt-0.5 h-5 w-5 text-yellow-700" />
            <div>
              <p className="font-semibold text-yellow-900">Dossier de sauvegarde inaccessible</p>
              <p className="text-sm text-yellow-700">
                Vérifiez le volume Docker partagé avec <code>/app/backups</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Liste des sauvegardes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-14 text-center text-gray-500">Chargement des sauvegardes...</div>
            ) : backups.length === 0 ? (
              <div className="py-14 text-center text-gray-500">
                Aucune sauvegarde disponible. Créez une sauvegarde métier pour commencer.
              </div>
            ) : (
              <div className="space-y-4">
                {backups.map((backup) => {
                  const isBusiness = backup.scope === "business" || backup.filename.includes("_business_");
                  return (
                    <div key={backup.filename} className="rounded-3xl border border-gray-200 bg-white p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <HardDriveDownload className="h-5 w-5 text-gray-500" />
                            <p className="break-all font-semibold text-gray-900">{backup.filename}</p>
                            <Badge variant={isBusiness ? "secondary" : "default"}>
                              {isBusiness ? "Données métier" : "Complète"}
                            </Badge>
                            {backup.format_version === "legacy" && <Badge variant="outline">Ancien format</Badge>}
                          </div>
                          <p className="mt-2 text-sm text-gray-500">
                            {new Date(backup.modified_at).toLocaleString("fr-FR")} • {humanFileSize(backup.size_bytes)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {isBusiness ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                setPendingAction({ type: "restore_business", filename: backup.filename })
                              }
                              disabled={processing}
                            >
                              <ArrowDownRight className="mr-2 h-4 w-4" />
                              Restaurer les données
                            </Button>
                          ) : (
                            isAdmin && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  setPendingAction({ type: "restore_full", filename: backup.filename })
                                }
                                disabled={processing}
                              >
                                <ArrowDownRight className="mr-2 h-4 w-4" />
                                Restaurer tout
                              </Button>
                            )
                          )}

                          {isAdmin && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setPendingAction({ type: "delete", filename: backup.filename })}
                              disabled={processing}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historique</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-14 text-center text-gray-500">Chargement...</div>
            ) : history.length === 0 ? (
              <div className="py-14 text-center text-gray-500">Aucune opération enregistrée.</div>
            ) : (
              <div className="space-y-3">
                {history.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {entry.action.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {entry.user || "Système"} • {new Date(entry.created_at).toLocaleString("fr-FR")}
                    </p>
                    <p className="mt-1 break-all text-xs text-gray-600">{entry.entity_id}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "delete"
                ? "Le fichier sera supprimé définitivement du dossier partagé."
                : pendingAction?.type === "restore_business"
                  ? "Les sessions, tarifs, ventes et postes actuels seront remplacés. Une sauvegarde métier préalable sera créée automatiquement. Les comptes et MikroTik resteront intacts."
                  : "Toutes les données de la base peuvent être remplacées. Cette opération est réservée à l’administrateur."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingAction?.type === "restore_full" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Mode de restauration</p>
              <Select value={restoreMode} onValueChange={(value) => setRestoreMode(value as typeof restoreMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Mode de restauration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Remplacement direct</SelectItem>
                  <SelectItem value="backup_before_restore">Sauvegarde préalable puis restauration</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <p className="break-all text-sm text-gray-500">
            Fichier : <span className="font-medium text-gray-700">{pendingAction?.filename}</span>
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={processing}
              onClick={() => void confirmAction()}
              className={pendingAction?.type === "delete" ? "bg-red-600 hover:bg-red-700" : undefined}
            >
              {processing ? "Traitement..." : pendingAction?.type === "delete" ? "Supprimer" : "Restaurer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
