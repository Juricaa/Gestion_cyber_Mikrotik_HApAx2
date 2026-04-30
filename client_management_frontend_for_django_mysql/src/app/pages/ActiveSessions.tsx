import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useApp } from "../context/AppContext";
import { Session, ServiceType, SessionType } from "../types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

import {
  Wifi,
  Gamepad2,
  Clock,
  StopCircle,
  Printer,
  Plus,
  Timer,
  CheckCircle2,
  Pause,
  Play,
  Copy,
} from "lucide-react";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

import {
  NotificationPlayer,
  playNotificationSound,
} from "../utils/notificationSounds";

import { cn } from "../components/ui/utils";

function isBackendPausedSession(session: Session) {
  return Boolean(
    session.isPaused ||
      String((session as any).status || "").toLowerCase() === "paused"
  );
}

function isVisibleActiveSession(session: Session) {
  const status = String((session as any).status || "").toLowerCase();

  return (
    !session.archived &&
    (status === "active" || status === "paused" || Boolean(session.isPaused))
  );
}

function isWaitingForHotspotSession(session: Session) {
  const status = String((session as any).status || "").toLowerCase();

  return Boolean(
    session.waitingForHotspot ||
      (session.serviceType === "wifi" &&
        status === "active" &&
        Boolean(session.voucherCode || session.mikrotikUsername) &&
        !session.lastResumedAt &&
        Math.max(0, Math.floor(session.elapsedSeconds || 0)) === 0)
  );
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

export function ActiveSessions() {
  const {
    sessions,
    settings,
    terminateSession,
    pauseSession,
    resumeSession,
    fetchSessions,
    addSession,
    getNextServiceName,
  } = useApp();

  const [terminating, setTerminating] = useState<string | null>(null);
  const [pausing, setPausing] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);

  const [clientName, setClientName] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("wifi");
  const [sessionType, setSessionType] = useState<SessionType>("open");
  const [plannedDuration, setPlannedDuration] = useState<number>(60);
  const [loading, setLoading] = useState(false);

  const [elapsedSecondsById, setElapsedSecondsById] = useState<
    Record<string, number>
  >({});

  /**
   * Pause locale immédiate.
   * Important : quand on clique Pause, le frontend doit arrêter chrono + notification
   * avant même que fetchSessions récupère status="paused" depuis le backend.
   */
  const [localPausedIds, setLocalPausedIds] = useState<Set<string>>(new Set());

  const notificationPlayersRef = useRef<Map<string, NotificationPlayer>>(
    new Map()
  );

  /**
   * Protection anti-double notification.
   * La Map garde le player audio, ce Set garde l'état logique
   * "la notification répétée est déjà lancée pour cette session".
   * Comme ça, même si le composant se re-render chaque seconde,
   * on ne crée jamais deux players pour la même session.
   */
  const repeatNotificationIdsRef = useRef<Set<string>>(new Set());

  const notifiedOnceRef = useRef<Set<string>>(new Set());

  /**
   * Évite d'envoyer plusieurs POST /finish/ quand le chrono arrive à zéro.
   */
  const autoFinishingIdsRef = useRef<Set<string>>(new Set());

  const serviceName = getNextServiceName(serviceType);

  const activeSessions = useMemo(() => {
    return sessions.filter(isVisibleActiveSession);
  }, [sessions]);

  const isSessionPaused = useCallback(
    (session: Session) => {
      return (
        localPausedIds.has(String(session.id)) || isBackendPausedSession(session)
      );
    },
    [localPausedIds]
  );

  const stopNotificationForSession = useCallback((sessionId: string) => {
    const player = notificationPlayersRef.current.get(sessionId);

    if (player) {
      player.stop();
      notificationPlayersRef.current.delete(sessionId);
    }

    repeatNotificationIdsRef.current.delete(sessionId);
    notifiedOnceRef.current.delete(sessionId);
  }, []);

  const stopAllNotifications = useCallback(() => {
    notificationPlayersRef.current.forEach((player) => player.stop());
    notificationPlayersRef.current.clear();
    repeatNotificationIdsRef.current.clear();
    notifiedOnceRef.current.clear();
  }, []);

  const getInitialElapsedSeconds = useCallback((session: Session) => {
    if (isWaitingForHotspotSession(session)) {
      return 0;
    }

    // Priorité au compteur précis renvoyé par Django.
    // C'est indispensable pour une session WiFi dont le timer démarre seulement
    // quand MikroTik voit le voucher dans /ip hotspot active.
    if (typeof session.elapsedSeconds === "number") {
      return Math.max(0, Math.floor(session.elapsedSeconds));
    }

    if (
      session.sessionType === "countdown" &&
      session.plannedDuration &&
      typeof session.remainingSeconds === "number"
    ) {
      const totalPlannedSeconds = session.plannedDuration * 60;

      return Math.max(0, totalPlannedSeconds - session.remainingSeconds);
    }

    const startTime = new Date(session.startTime).getTime();

    if (!Number.isNaN(startTime) && session.lastResumedAt) {
      const backendPausedSeconds = session.totalPausedSeconds || 0;

      return Math.max(
        0,
        Math.floor((Date.now() - startTime) / 1000) - backendPausedSeconds
      );
    }

    return Math.max(0, Math.floor((session.elapsedTime || 0) * 60));
  }, []);

  useEffect(() => {
    setElapsedSecondsById((previous) => {
      const next: Record<string, number> = {};

      activeSessions.forEach((session) => {
        const sessionId = String(session.id);
        const backendInitialSeconds = getInitialElapsedSeconds(session);

        if (isWaitingForHotspotSession(session)) {
          next[sessionId] = 0;
        } else if (isSessionPaused(session)) {
          next[sessionId] = backendInitialSeconds;
        } else {
          // Si Django détecte le voucher après quelques secondes,
          // on resynchronise immédiatement au compteur backend au lieu de repartir de 0.
          next[sessionId] = Math.max(
            previous[sessionId] ?? backendInitialSeconds,
            backendInitialSeconds
          );
        }
      });

      return next;
    });
  }, [activeSessions, getInitialElapsedSeconds, isSessionPaused]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSecondsById((previous) => {
        const next = { ...previous };

        activeSessions.forEach((session) => {
          const sessionId = String(session.id);

          const currentSeconds =
            next[sessionId] ?? getInitialElapsedSeconds(session);

          if (isWaitingForHotspotSession(session)) {
            next[sessionId] = 0;
          } else if (isSessionPaused(session)) {
            next[sessionId] = currentSeconds;
          } else {
            next[sessionId] = currentSeconds + 1;
          }
        });

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSessions, getInitialElapsedSeconds, isSessionPaused]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchSessions]);

  const getElapsedSeconds = (session: Session) => {
    return (
      elapsedSecondsById[String(session.id)] ?? getInitialElapsedSeconds(session)
    );
  };

  const getTimeInfo = (session: Session) => {
    const paused = isSessionPaused(session);
    const waitingHotspot = isWaitingForHotspotSession(session);

    if (session.sessionType === "countdown" && session.plannedDuration) {
      const totalPlannedSeconds = session.plannedDuration * 60;

      let elapsedSeconds = getElapsedSeconds(session);
      let remainingSeconds = totalPlannedSeconds - elapsedSeconds;

      if (waitingHotspot) {
        remainingSeconds =
          typeof session.remainingSeconds === "number" && session.remainingSeconds > 0
            ? session.remainingSeconds
            : totalPlannedSeconds;
        elapsedSeconds = 0;
      }

      /**
       * Correction importante :
       * Si la session est en pause et que le backend donne remainingSeconds,
       * on affiche exactement remainingSeconds du backend.
       * Donc si DB = 34s et status=paused, le frontend reste à 34s.
       */
      if (!waitingHotspot && paused && typeof session.remainingSeconds === "number") {
        remainingSeconds = Math.max(0, session.remainingSeconds);
        elapsedSeconds = Math.max(0, totalPlannedSeconds - remainingSeconds);
      }

      const isExpired = !waitingHotspot && !paused && remainingSeconds <= 0;
      const isWarning = !waitingHotspot && !paused && remainingSeconds <= 300 && remainingSeconds > 0;

      return {
        display: isExpired
          ? `+${formatDuration(Math.abs(remainingSeconds))}`
          : formatDuration(remainingSeconds),
        remainingSeconds,
        isExpired,
        isWarning,
        isPaused: paused,
        isWaiting: waitingHotspot,
        elapsedMinutes: Math.floor(elapsedSeconds / 60),
        elapsedSeconds,
      };
    }

    const elapsedSeconds = waitingHotspot ? 0 : getElapsedSeconds(session);

    return {
      display: waitingHotspot ? "En attente" : formatDuration(elapsedSeconds),
      remainingSeconds: 0,
      isExpired: false,
      isWarning: false,
      isPaused: paused,
      isWaiting: waitingHotspot,
      elapsedMinutes: Math.floor(elapsedSeconds / 60),
      elapsedSeconds,
    };
  };

  const calculateCost = (session: Session, elapsedMinutes: number) => {
    if (isWaitingForHotspotSession(session)) {
      return 0;
    }

    const rate =
      session.serviceType === "wifi"
        ? settings.rates.wifi
        : settings.rates.console;

    const cost = Math.ceil((elapsedMinutes / 60) * rate.hourlyRate);

    return Math.max(cost, rate.minCharge);
  };

  useEffect(() => {
    if (!settings.notifications.enabled) {
      stopAllNotifications();
      return;
    }

    const visibleSessionIds = new Set(
      activeSessions.map((session) => String(session.id))
    );

    /**
     * Nettoyage de sécurité :
     * - session supprimée/archivée/terminée
     * - session en pause
     * - session non expirée
     * - mode notification passé de répétition à une seule fois
     */
    notificationPlayersRef.current.forEach((player, sessionId) => {
      const session = activeSessions.find(
        (item) => String(item.id) === String(sessionId)
      );

      const backendStatus = String((session as any)?.status || "").toLowerCase();
      const shouldStop =
        !session ||
        !visibleSessionIds.has(sessionId) ||
        isSessionPaused(session) ||
        isWaitingForHotspotSession(session) ||
        backendStatus !== "active" ||
        session.sessionType !== "countdown" ||
        !getTimeInfo(session).isExpired ||
        !settings.notifications.repeat;

      if (shouldStop) {
        player.stop();
        notificationPlayersRef.current.delete(sessionId);
        repeatNotificationIdsRef.current.delete(sessionId);
      }
    });

    activeSessions.forEach((session) => {
      const sessionId = String(session.id);
      const backendStatus = String((session as any).status || "").toLowerCase();

      if (
        isSessionPaused(session) ||
        isWaitingForHotspotSession(session) ||
        backendStatus !== "active" ||
        session.sessionType !== "countdown"
      ) {
        stopNotificationForSession(sessionId);
        return;
      }

      const timeInfo = getTimeInfo(session);

      if (!timeInfo.isExpired) {
        stopNotificationForSession(sessionId);
        return;
      }

      if (settings.notifications.repeat) {
        /**
         * Ne jamais dépendre uniquement de player.isPlaying().
         * Si isPlaying() retourne false pendant que le son existe encore,
         * l'ancien code recréait un deuxième player => double notification.
         */
        if (!repeatNotificationIdsRef.current.has(sessionId)) {
          const newPlayer = new NotificationPlayer();

          newPlayer.start(
            settings.notifications.sound,
            settings.notifications.volume
          );

          notificationPlayersRef.current.set(sessionId, newPlayer);
          repeatNotificationIdsRef.current.add(sessionId);
        }

        return;
      }

      const repeatPlayer = notificationPlayersRef.current.get(sessionId);

      if (repeatPlayer) {
        repeatPlayer.stop();
        notificationPlayersRef.current.delete(sessionId);
        repeatNotificationIdsRef.current.delete(sessionId);
      }

      if (!notifiedOnceRef.current.has(sessionId)) {
        playNotificationSound(
          settings.notifications.sound,
          settings.notifications.volume
        );

        notifiedOnceRef.current.add(sessionId);
      }
    });

    notifiedOnceRef.current.forEach((sessionId) => {
      const stillVisible = visibleSessionIds.has(String(sessionId));

      if (!stillVisible) {
        notifiedOnceRef.current.delete(sessionId);
      }
    });
  }, [
    activeSessions,
    elapsedSecondsById,
    settings.notifications.enabled,
    settings.notifications.repeat,
    settings.notifications.sound,
    settings.notifications.volume,
    isSessionPaused,
    stopAllNotifications,
    stopNotificationForSession,
  ]);

  useEffect(() => {
    return () => {
      stopAllNotifications();
    };
  }, [stopAllNotifications]);

  useEffect(() => {
    activeSessions.forEach((session) => {
      const sessionId = String(session.id);
      const backendStatus = String((session as any).status || "").toLowerCase();

      if (
        backendStatus !== "active" ||
        session.sessionType !== "countdown" ||
        isSessionPaused(session) ||
        isWaitingForHotspotSession(session) ||
        autoFinishingIdsRef.current.has(sessionId)
      ) {
        return;
      }

      const timeInfo = getTimeInfo(session);

      if (timeInfo.remainingSeconds > 0) {
        return;
      }

      autoFinishingIdsRef.current.add(sessionId);

      if (settings.notifications.enabled && !notifiedOnceRef.current.has(sessionId)) {
        playNotificationSound(
          settings.notifications.sound,
          settings.notifications.volume
        );
        notifiedOnceRef.current.add(sessionId);
      }

      terminateSession(sessionId)
        .then(async () => {
          stopNotificationForSession(sessionId);

          setElapsedSecondsById((previous) => {
            const next = { ...previous };
            delete next[sessionId];
            return next;
          });

          setLocalPausedIds((previous) => {
            const next = new Set(previous);
            next.delete(sessionId);
            return next;
          });

          toast.success(
            `Temps écoulé : session ${session.clientName} terminée et connexion coupée`
          );

          await fetchSessions();
        })
        .catch((error) => {
          console.error("Erreur auto-terminaison session countdown:", error);
          toast.error("Temps écoulé, mais impossible de couper la session automatiquement");
          autoFinishingIdsRef.current.delete(sessionId);
        });
    });
  }, [
    activeSessions,
    elapsedSecondsById,
    fetchSessions,
    isSessionPaused,
    settings.notifications.enabled,
    settings.notifications.sound,
    settings.notifications.volume,
    stopNotificationForSession,
    terminateSession,
  ]);


  const handlePauseResume = async (session: Session) => {
    const sessionId = String(session.id);

    if (isWaitingForHotspotSession(session)) {
      toast.info("Le client n'a pas encore utilisé le voucher. Le chrono n'a pas démarré.");
      return;
    }

    const paused = isSessionPaused(session);

    setPausing(sessionId);

    try {
      if (paused) {
        await resumeSession(sessionId);

        setLocalPausedIds((previous) => {
          const next = new Set(previous);
          next.delete(sessionId);
          return next;
        });

        toast.success("Session reprise");
      } else {
        const snapshotSeconds = getElapsedSeconds(session);

        setElapsedSecondsById((previous) => ({
          ...previous,
          [sessionId]: snapshotSeconds,
        }));

        /**
         * Important :
         * On met la pause locale immédiatement pour stopper chrono + notification
         * sans attendre le retour backend.
         */
        setLocalPausedIds((previous) => {
          const next = new Set(previous);
          next.add(sessionId);
          return next;
        });

        stopNotificationForSession(sessionId);

        await pauseSession(sessionId);

        toast.success("Session en pause");
      }

      await fetchSessions();
    } catch (error) {
      console.error("Erreur pause/reprise:", error);
      toast.error("Erreur lors de la pause/reprise");

      /**
       * Si la pause échoue, on retire la pause locale pour ne pas bloquer
       * une session qui est encore active côté backend.
       */
      await fetchSessions();

      setLocalPausedIds((previous) => {
        const next = new Set(previous);

        const freshSession = sessions.find(
          (item) => String(item.id) === sessionId
        );

        if (!freshSession || !isBackendPausedSession(freshSession)) {
          next.delete(sessionId);
        }

        return next;
      });
    } finally {
      setPausing(null);
    }
  };

  const handleTerminate = async (session: Session) => {
    const timeInfo = getTimeInfo(session);
    const totalCost = calculateCost(session, timeInfo.elapsedMinutes);

    setSelectedSession({
      ...session,
      elapsedTime: timeInfo.elapsedMinutes,
      totalCost,
    });
  };

  const confirmTerminate = async () => {
    if (!selectedSession) return;

    const sessionId = String(selectedSession.id);

    setTerminating(sessionId);

    try {
      stopNotificationForSession(sessionId);

      await terminateSession(
        sessionId,
        selectedSession.elapsedTime || 0,
        selectedSession.totalCost || 0
      );

      setElapsedSecondsById((previous) => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });

      setLocalPausedIds((previous) => {
        const next = new Set(previous);
        next.delete(sessionId);
        return next;
      });

      toast.success("Session terminée avec succès");
      setSelectedSession(null);
      await fetchSessions();
    } catch (error) {
      console.error("Erreur terminaison session:", error);
      toast.error("Erreur lors de la terminaison de la session");
    } finally {
      setTerminating(null);
    }
  };

  const getSessionVoucher = (session: Session) => {
    return session.voucherCode || session.mikrotikUsername || "";
  };

  const copyVoucherCode = async (session: Session) => {
    const voucherCode = getSessionVoucher(session);

    if (!voucherCode) {
      toast.error("Aucun code voucher pour cette session");
      return;
    }

    try {
      await navigator.clipboard.writeText(voucherCode);
      toast.success(`Code copié : ${voucherCode}`);
    } catch {
      toast.error("Impossible de copier automatiquement le code");
    }
  };

  const printTicket = (session: Session) => {
    const timeInfo = getTimeInfo(session);
    const totalCost = calculateCost(session, timeInfo.elapsedMinutes);
    const paused = isSessionPaused(session);
    const voucherCode = getSessionVoucher(session);

    const printContent = `
      <html>
        <head>
          <title>Ticket - ${session.serviceName}</title>
          <style>
            body {
              font-family: monospace;
              padding: 20px;
              max-width: 300px;
              margin: 0 auto;
            }
            h1 {
              text-align: center;
              font-size: 18px;
              margin-bottom: 20px;
            }
            .line {
              border-top: 1px dashed #000;
              margin: 10px 0;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin: 5px 0;
            }
            .total {
              font-size: 20px;
              font-weight: bold;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <h1>Cyber Café - Ticket</h1>
          <div class="line"></div>
          <div class="row"><span>Client:</span><span>${session.clientName}</span></div>
          <div class="row"><span>Service:</span><span>${session.serviceName}</span></div>
          <div class="row"><span>Type:</span><span>${session.serviceType === "wifi" ? "Wifi" : "Console"}</span></div>
          ${session.serviceType === "wifi" && voucherCode ? `
          <div class="line"></div>
          <div class="row"><span>Code WiFi:</span><span>${voucherCode}</span></div>
          <div class="row"><span>Password:</span><span>${voucherCode}</span></div>
          <div class="line"></div>
          ` : ""}
          <div class="row"><span>Début:</span><span>${new Date(session.startTime).toLocaleTimeString()}</span></div>
          <div class="row"><span>Durée:</span><span>${timeInfo.elapsedMinutes} min</span></div>
          <div class="row"><span>Statut:</span><span>${paused ? "Pause" : "En cours"}</span></div>
          <div class="line"></div>
          <div class="row total"><span>TOTAL:</span><span>${totalCost.toLocaleString()} Ar</span></div>
          <div class="line"></div>
          <p style="text-align: center; margin-top: 20px; font-size: 12px;">Merci de votre visite!</p>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");

    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleNewSession = async (e: FormEvent) => {
    e.preventDefault();

    let finalClientName = clientName.trim();

    if (!finalClientName) {
      const randomNumber = Math.floor(1000 + Math.random() * 9000);
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

      setClientName("");
      setServiceType("wifi");
      setSessionType("open");
      setPlannedDuration(60);
      setIsNewSessionOpen(false);

      await fetchSessions();
    } catch (error) {
      console.error("Erreur création session:", error);
      toast.error("Erreur lors de la création de la session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Sessions actives
          </h1>

          <p className="text-gray-600 mt-1">
            {activeSessions.length} session
            {activeSessions.length > 1 ? "s" : ""} affichée
            {activeSessions.length > 1 ? "s" : ""}
          </p>
        </div>

        <Button
          onClick={() => setIsNewSessionOpen(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nouvelle session
        </Button>
      </div>

      {activeSessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucune session active
            </h3>

            <p className="text-gray-500 mb-4">
              Démarrez une nouvelle session pour commencer
            </p>

            <Button
              onClick={() => setIsNewSessionOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Démarrer une session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeSessions.map((session) => {
            const timeInfo = getTimeInfo(session);
            const cost = calculateCost(session, timeInfo.elapsedMinutes);
            const paused = isSessionPaused(session);
            const waitingHotspot = isWaitingForHotspotSession(session);

            return (
              <Card
                key={session.id}
                className={cn(
                  waitingHotspot && "border-slate-400 border-2 bg-slate-50/60",
                  paused && "border-blue-500 border-2 bg-blue-50/40",
                  !waitingHotspot &&
                    !paused &&
                    timeInfo.isExpired &&
                    "border-red-500 border-2 shadow-lg animate-pulse",
                  !waitingHotspot &&
                    !paused &&
                    timeInfo.isWarning &&
                    "border-yellow-500 border-2"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-12 h-12 rounded-lg flex items-center justify-center",
                          session.serviceType === "wifi"
                            ? "bg-blue-100"
                            : "bg-purple-100"
                        )}
                      >
                        {session.serviceType === "wifi" ? (
                          <Wifi className="w-6 h-6 text-blue-600" />
                        ) : (
                          <Gamepad2 className="w-6 h-6 text-purple-600" />
                        )}
                      </div>

                      <div>
                        <CardTitle className="text-lg">
                          {session.serviceName}
                        </CardTitle>

                        <p className="text-sm text-gray-500">
                          {session.clientName}
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant={
                        timeInfo.isExpired && !paused
                          ? "destructive"
                          : "default"
                      }
                      className={cn(
                        "font-bold px-2 py-1",
                        waitingHotspot && "bg-slate-600 text-white",
                        !waitingHotspot && paused && "bg-blue-500 text-white",
                        !waitingHotspot &&
                          !paused &&
                          timeInfo.isWarning &&
                          "bg-yellow-500 text-black",
                        !waitingHotspot &&
                          !paused &&
                          !timeInfo.isExpired &&
                          !timeInfo.isWarning &&
                          "bg-green-500 text-white"
                      )}
                    >
                      {waitingHotspot
                        ? "En attente client"
                        : paused
                          ? "Pause"
                          : session.sessionType === "countdown"
                            ? "Compte à rebours"
                            : "Ouvert"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div
                    className={cn(
                      "text-center p-4 rounded-lg",
                      waitingHotspot && "bg-slate-50 border-2 border-slate-200",
                      !waitingHotspot && paused && "bg-blue-50 border-2 border-blue-200",
                      !waitingHotspot &&
                        !paused &&
                        timeInfo.isExpired &&
                        "bg-red-50 border-2 border-red-200",
                      !waitingHotspot &&
                        !paused &&
                        timeInfo.isWarning &&
                        "bg-yellow-50 border-2 border-yellow-200",
                      !waitingHotspot &&
                        !paused &&
                        !timeInfo.isExpired &&
                        !timeInfo.isWarning &&
                        "bg-gray-50"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Clock
                        className={cn(
                          "w-5 h-5",
                          waitingHotspot && "text-slate-600",
                          !waitingHotspot && paused && "text-blue-600",
                          !waitingHotspot && !paused && timeInfo.isExpired && "text-red-600",
                          !waitingHotspot && !paused && timeInfo.isWarning && "text-yellow-600",
                          !waitingHotspot &&
                            !paused &&
                            !timeInfo.isExpired &&
                            !timeInfo.isWarning &&
                            "text-gray-600"
                        )}
                      />

                      <p className="text-sm text-gray-600">
                        {waitingHotspot
                          ? "En attente connexion client"
                          : paused
                            ? "Temps en pause"
                            : session.sessionType === "countdown"
                              ? timeInfo.isExpired
                                ? "Temps dépassé"
                                : "Temps restant"
                              : "Temps"}
                      </p>
                    </div>

                    <p
                      className={cn(
                        "text-3xl font-bold",
                        waitingHotspot && "text-slate-700",
                        !waitingHotspot && paused && "text-blue-600",
                        !waitingHotspot && !paused && timeInfo.isExpired && "text-red-600",
                        !waitingHotspot && !paused && timeInfo.isWarning && "text-yellow-600",
                        !waitingHotspot &&
                          !paused &&
                          !timeInfo.isExpired &&
                          !timeInfo.isWarning &&
                          "text-gray-900"
                      )}
                    >
                      {timeInfo.display}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <span className="text-sm text-gray-600">
                      Coût actuel
                    </span>

                    <span className="text-xl font-bold text-blue-600">
                      {cost.toLocaleString()} Ar
                    </span>
                  </div>

                  {session.serviceType === "wifi" && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-700">
                          Code voucher client
                        </span>

                        <Badge
                          className={cn(
                            waitingHotspot
                              ? "bg-slate-600 text-white"
                              : "bg-green-600 text-white"
                          )}
                        >
                          {waitingHotspot ? "Non utilisé" : "Hotspot"}
                        </Badge>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 rounded bg-white px-3 py-2 text-base font-bold text-green-700 border border-green-200">
                          {getSessionVoucher(session) || "Code non généré"}
                        </code>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyVoucherCode(session)}
                          disabled={!getSessionVoucher(session)}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copier
                        </Button>
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        {waitingHotspot
                          ? "Le chrono démarre seulement quand ce code apparaît dans MikroTik > IP > Hotspot > Active."
                          : "Username et mot de passe : même code."}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePauseResume(session)}
                      disabled={pausing === String(session.id) || waitingHotspot}
                      className="flex-1 w-full"
                    >
                      {paused ? (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Reprendre
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4 mr-1" />
                          Pause
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printTicket(session)}
                      className="flex-1 w-full"
                    >
                      <Printer className="w-4 h-4 mr-1" />
                      Ticket
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleTerminate(session)}
                      className="flex-1 w-full"
                    >
                      <StopCircle className="w-4 h-4 mr-1" />
                      Fin
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle session</DialogTitle>
            <DialogDescription>
              Démarrer une session pour un client
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleNewSession} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Nom du client optionnel</Label>

              <Input
                id="clientName"
                placeholder="Ex: Jean Dupont"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />

              <p className="text-sm text-gray-500">
                Si vide, un nom sera généré automatiquement.
              </p>
            </div>

            <div className="space-y-3">
              <Label>Type de service</Label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={cn(
                    "relative flex items-center space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-105",
                    serviceType === "wifi"
                      ? "border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-105"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                  )}
                  onClick={() => setServiceType("wifi")}
                >
                  {serviceType === "wifi" && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="w-6 h-6 text-blue-600" />
                    </div>
                  )}

                  <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-blue-500 shadow-lg">
                    <Wifi className="w-7 h-7 text-white" />
                  </div>

                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      Wifi
                    </div>

                    <p className="text-sm text-gray-500">
                      Connexion internet
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    "relative flex items-center space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-105",
                    serviceType === "console"
                      ? "border-purple-600 bg-gradient-to-br from-purple-50 to-purple-100 shadow-lg scale-105"
                      : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
                  )}
                  onClick={() => setServiceType("console")}
                >
                  {serviceType === "console" && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="w-6 h-6 text-purple-600" />
                    </div>
                  )}

                  <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-purple-500 shadow-lg">
                    <Gamepad2 className="w-7 h-7 text-white" />
                  </div>

                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      Console
                    </div>

                    <p className="text-sm text-gray-500">
                      PS5, Xbox, etc.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Nom du service :</span>{" "}
                  <span className="text-blue-600 font-bold text-base">
                    {serviceName}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Mode de session</Label>

              <div className="space-y-3">
                <div
                  className={cn(
                    "relative flex items-start space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-[1.02]",
                    sessionType === "open"
                      ? "border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-[1.02]"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                  )}
                  onClick={() => setSessionType("open")}
                >
                  {sessionType === "open" && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="w-6 h-6 text-blue-600" />
                    </div>
                  )}

                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500">
                    <Clock className="w-6 h-6 text-white" />
                  </div>

                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      Session ouverte
                    </div>

                    <p className="text-sm mt-1 text-gray-500">
                      Compteur libre, sans limite de temps.
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    "relative flex items-start space-x-3 border-2 rounded-xl p-5 cursor-pointer transition-all duration-300 transform hover:scale-[1.02]",
                    sessionType === "countdown"
                      ? "border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-[1.02]"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                  )}
                  onClick={() => setSessionType("countdown")}
                >
                  {sessionType === "countdown" && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="w-6 h-6 text-blue-600" />
                    </div>
                  )}

                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500">
                    <Timer className="w-6 h-6 text-white" />
                  </div>

                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      Compte à rebours
                    </div>

                    <p className="text-sm mt-1 text-gray-500">
                      Définir une durée prévue.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {sessionType === "countdown" && (
              <div className="space-y-2">
                <Label htmlFor="plannedDuration">
                  Durée prévue en minutes
                </Label>

                <Input
                  id="plannedDuration"
                  type="number"
                  min="1"
                  value={plannedDuration}
                  onChange={(e) => setPlannedDuration(Number(e.target.value))}
                  placeholder="Ex: 60"
                  required
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsNewSessionOpen(false);
                  setClientName("");
                  setServiceType("wifi");
                  setSessionType("open");
                  setPlannedDuration(60);
                }}
                className="flex-1"
                disabled={loading}
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
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedSession}
        onOpenChange={() => setSelectedSession(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminer la session</DialogTitle>

            <DialogDescription>
              Confirmez la fin de cette session et le montant à payer.
            </DialogDescription>
          </DialogHeader>

          {selectedSession && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Client</span>

                  <span className="font-medium">
                    {selectedSession.clientName}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service</span>

                  <span className="font-medium">
                    {selectedSession.serviceName}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Durée</span>

                  <span className="font-medium">
                    {selectedSession.elapsedTime} minutes
                  </span>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">
                    Total à payer
                  </span>

                  <span className="text-2xl font-bold text-blue-600">
                    {selectedSession.totalCost?.toLocaleString()} Ar
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedSession(null)}
                  className="flex-1"
                  disabled={!!terminating}
                >
                  Annuler
                </Button>

                <Button
                  onClick={confirmTerminate}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={!!terminating}
                >
                  {terminating ? "Terminaison..." : "Confirmer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}