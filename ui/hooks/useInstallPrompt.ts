import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptState = {
  showBanner: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<void>;
  dismissInstall: () => void;
};

export function useInstallPrompt(): InstallPromptState {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isPwa =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone;
    const dismissed = localStorage.getItem("differ-install-dismissed") === "true";
    setIsStandalone(Boolean(isPwa));
    setShowBanner(!isPwa && !dismissed);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowBanner(false);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled as EventListener);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled as EventListener);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setShowBanner(false);
      }
    } catch {
      // ignore install errors
    } finally {
      setInstallPrompt(null);
    }
  };

  const dismissInstall = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("differ-install-dismissed", "true");
    }
    setShowBanner(false);
  };

  return {
    showBanner,
    canInstall: Boolean(installPrompt),
    isStandalone,
    promptInstall,
    dismissInstall,
  };
}
