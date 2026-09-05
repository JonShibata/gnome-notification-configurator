import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { RemovalAdapter } from "../source/removal.js";
import type { UpdateNotificationTimeoutHook } from "./manager.js";

export class TimeoutAdapter {
  private listenerId?: number;

  constructor(
    private settingsManager: SettingsManager,
    private removalAdapter: RemovalAdapter,
  ) {}

  createHook(): UpdateNotificationTimeoutHook {
    const settingsManager = this.settingsManager;
    const removalAdapter = this.removalAdapter;

    return (_original, timeout, { tray }) => {
      // Show-and-remove notifications use their configured timeout so the
      // RemovalAdapter timer, not the default notification-timeout, governs them.
      const notification = (tray as { _notification?: Notification })
        ._notification;
      if (notification && removalAdapter.isTracked(notification)) {
        const sourceTitle = notification.source?.title ?? "";
        const config = settingsManager.getConfigurationFor(
          sourceTitle,
          notification.title ?? "",
          notification.body ?? "",
        );
        const patternTimeout =
          config.timeout.enabled && config.timeout.notificationTimeout > 0
            ? config.timeout.notificationTimeout
            : settingsManager.notificationTimeout;
        return patternTimeout > 0 ? patternTimeout : timeout;
      }

      if (timeout !== null && timeout > 0) {
        const newTimeout =
          settingsManager.notificationTimeout > 0
            ? settingsManager.notificationTimeout
            : timeout;
        return newTimeout;
      }

      return timeout;
    };
  }

  register(manager: import("./manager.js").MessageTrayManager): void {
    this.listenerId = this.settingsManager.events.on(
      "notificationTimeoutChanged",
      () => {},
    );

    manager.registerUpdateNotificationTimeoutHook(this.createHook());
  }

  dispose(): void {
    if (this.listenerId !== undefined) {
      this.settingsManager.events.off(this.listenerId);
      this.listenerId = undefined;
    }
  }
}
