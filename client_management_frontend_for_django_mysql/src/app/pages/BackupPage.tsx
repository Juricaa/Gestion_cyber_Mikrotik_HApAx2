import { useEffect, useState } from "react";
import { Database, ArrowDownRight, Trash2, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
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
  BackupFile,
  BackupHistoryEntry,
  createBackup,
  deleteBackup,
  getBackups,
  restoreBackup,
} from "../utils/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";

const humanFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

export function BackupPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [backupDirAvailable, setBackupDirAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [operationLabel, setOperationLabel] = useState("Sauvegarde en cours");
  const [progress, setProgress] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    type: "restore" | "delete";
    filename: string;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState("backup_before_restore");

  const loadBackups = async () => {
    setLoading(true);
    try {
      const response = await getBackups();
      setBackupDirAvailable(response.backup_dir_available);
      setBackups(response.backups);
      setHistory(response.history);
    } catch (error: unknown) {
      console.error("Error loading backups:", error);
      toast.error("Impossible de charger les sauvegardes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  useEffect(() => {
    if (!processing) {
      return;
    }

    setProgress(8);
    const interval = window.setInterval(() => {
      setProgress((value) => Math.min(95, value + 7));
    }, 180);

    return () => window.clearInterval(interval);
  }, [processing]);

  const finishOperation = () => {
    setProgress(100);
    window.setTimeout(() => {
      setProgress(0);
    }, 400);
    setProcessing(false);
  };

  const handleCreate = async () => {
    setOperationLabel("Création de la sauvegarde");
    setProcessing(true);
    try {
      const result = await createBackup();
      toast.success(`Sauvegarde créée : ${result.filename}`);
      await loadBackups();
    } catch (error: unknown) {
      console.error("Error creating backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la création de la sauvegarde");
    } finally {
      finishOperation();
    }
  };

  const handleDelete = async (filename: string) => {
    setOperationLabel("Suppression de la sauvegarde");
    setProcessing(true);
    setPendingAction(null);
    try {
      await deleteBackup(filename);
      toast.success(`Sauvegarde supprimée : ${filename}`);
      await loadBackups();
    } catch (error: unknown) {
      console.error("Error deleting backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression de la sauvegarde");
    } finally {
      finishOperation();
    }
  };

  const handleRestore = async (filename: string) => {
    setOperationLabel("Restauration et synchronisation des données");
    setProcessing(true);
    setPendingAction(null);
    try {
      const result = await restoreBackup(filename, restoreMode as "replace" | "backup_before_restore");
      toast.success(`Restauration terminée : ${filename}`);
      await loadBackups();

      // Recharge toute l’application pour synchroniser les contextes React,
      // les sessions, les tarifs, les postes et les rapports restaurés.
      if (result.reload_required !== false) {
        window.setTimeout(() => window.location.reload(), 700);
      }
    } catch (error: unknown) {
      console.error("Error restoring backup:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la restauration de la sauvegarde");
    } finally {
      finishOperation();
    }
  };

  const actionLabel = pendingAction?.type === "restore" ? "Restaurer" : "Supprimer";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sauvegardes</h1>
            <p className="text-gray-600 mt-1">
              Gérer les sauvegardes de base de données et restaurer les versions précédentes.
            </p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={processing || !backupDirAvailable}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {processing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sauvegarder...</>
            ) : (
              <>Sauvegarder</>
            )}
          </Button>
        </div>
      </div>

      {processing && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-900">{operationLabel}</p>
                <p className="text-sm text-blue-700">Ne fermez pas cette page avant la fin de l’opération.</p>
              </div>
              <span className="text-sm text-blue-800">{progress}%</span>
            </div>
            <div className="mt-4">
              <Progress value={progress} />
            </div>
          </CardContent>
        </Card>
      )}

      {!backupDirAvailable && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent>
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-yellow-700 mt-1" />
              <div>
                <p className="font-semibold text-yellow-900">Dossier de sauvegarde introuvable</p>
                <p className="text-sm text-yellow-700">
                  Le répertoire partagé <code>/app/backups</code> n'est pas accessible. Vérifiez votre configuration Docker.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="space-y-6">
          <CardHeader>
            <CardTitle>Liste des sauvegardes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-14 text-center text-gray-500">Chargement des sauvegardes...</div>
            ) : backups.length === 0 ? (
              <div className="py-14 text-center text-gray-500">
                Aucune sauvegarde trouvée. Créez une sauvegarde pour voir les fichiers disponibles.
              </div>
            ) : (
              <div className="space-y-3">
                {backups.map((backup) => (
                  <div
                    key={backup.filename}
                    className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-gray-900 truncate">{backup.filename}</p>
                          <Badge variant="outline">{backup.type}</Badge>
                          {backup.format_version === "cyber-manager-v1" && (
                            <Badge variant="secondary">Format unifié</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {humanFileSize(backup.size_bytes)} • Modifié le {new Date(backup.modified_at).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => setPendingAction({ type: "restore", filename: backup.filename })}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <ArrowDownRight className="w-4 h-4 mr-2" />
                          Restaurer
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setPendingAction({ type: "delete", filename: backup.filename })}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historique des opérations</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-14 text-center text-gray-500">Chargement de l'historique...</div>
            ) : history.length === 0 ? (
              <div className="py-14 text-center text-gray-500">
                Les actions de sauvegarde et restauration apparaîtront ici.
              </div>
            ) : (
              <div className="space-y-4">
                {history.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{entry.action.replaceAll("_", " ")}</p>
                        <p className="text-sm text-gray-500">
                          {entry.user || "Système"} • {new Date(entry.created_at).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <Badge variant="secondary">{entry.entity_id}</Badge>
                    </div>
                    {entry.payload?.filename && (
                      <p className="mt-2 text-sm text-gray-600">Fichier : {entry.payload.filename}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={() => setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionLabel} la sauvegarde ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "delete" ? (
                "Cette action supprimera définitivement le fichier de sauvegarde choisi."
              ) : (
                "Cette restauration peut remplacer les données de la base de données. Vous pouvez créer une sauvegarde préalable avant de restaurer."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            {pendingAction?.type === "restore" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">Mode de restauration</p>
                <Select value={restoreMode} onValueChange={(value) => setRestoreMode(value as "replace" | "backup_before_restore") }>
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
            <p className="text-sm text-gray-500">
              Fichier sélectionné : <span className="font-medium">{pendingAction?.filename}</span>
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingAction) return;
                if (pendingAction.type === "delete") {
                  void handleDelete(pendingAction.filename);
                } else {
                  void handleRestore(pendingAction.filename);
                }
              }}
              disabled={processing}
              className={pendingAction?.type === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}
            >
              {processing ? "Traitement..." : actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
