import type { SettingsManager } from "../../utils/settings.js";
import type { UpdateNotificationTimeoutHook } from "./manager.js";
import type { RemovalAdapter } from "../source/removal.js";

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
      // Check if this is a show-and-remove notification
      // If so, don't apply notification-timeout to let auto-removal handle it
      const notification = (tray as any)._notification;
      if (notification && removalAdapter.isTracked(notification)) {
        // Return null to prevent the notification from auto-dismissing
        // Let the RemovalAdapter's auto-removal timeout handle it instead
        log(
          `[TimeoutAdapter] Preventing notification-timeout for tracked show-and-remove notification`,
        );
        return null;
      }

      if (timeout !== null && timeout > 0) {
        const newTimeout = settingsManager.notificationTimeout > 0
          ? settingsManager.notificationTimeout
          : timeout;
        if (newTimeout !== null && newTimeout !== timeout) {
          log(
            `[TimeoutAdapter] Changing notification-timeout from ${timeout}ms to ${newTimeout}ms`,
          );
        }
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
