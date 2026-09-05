import GLib from "gi://GLib";
import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { AddNotificationHook } from "./manager.js";

export class RemovalAdapter {
  private timeouts = new Map<Notification, number>();
  private trackedNotifications = new WeakSet<Notification>();

  constructor(private settingsManager: SettingsManager) {}

  createHook(): AddNotificationHook {
    const settingsManager = this.settingsManager;
    const timeouts = this.timeouts;
    const trackedNotifications = this.trackedNotifications;

    return (_original, notification, { source }) => {
      const sourceTitle =
        notification.source?.title ?? source.title ?? "UNK_SRC";

      if (settingsManager.filteringEnabled) {
        const filterAction = settingsManager.getFilterFor(
          sourceTitle,
          notification.title ?? "",
          notification.body ?? "",
        );

        if (filterAction === "show-and-remove") {
          trackedNotifications.add(notification);
          // Mark as resident so GNOME hides the banner on timeout
          // without destroying the notification or removing it from the stack.
          // RemovalAdapter's own timer handles actual destruction.
          (notification as { resident?: boolean }).resident = true;

          const timeout = settingsManager.autoRemovalTimeout;
          if (timeout > 0) {
            const timeoutId = GLib.timeout_add(
              GLib.PRIORITY_DEFAULT,
              timeout,
              () => {
                notification.destroy();
                timeouts.delete(notification);
                trackedNotifications.delete(notification);
                return GLib.SOURCE_REMOVE;
              },
            );
            timeouts.set(notification, timeoutId);

            const originalDestroy = notification.destroy.bind(notification);
            notification.destroy = () => {
              const existingTimeout = timeouts.get(notification);
              if (existingTimeout !== undefined) {
                GLib.Source.remove(existingTimeout);
                timeouts.delete(notification);
              }
              trackedNotifications.delete(notification);
              originalDestroy();
            };
          }
        }
      }
    };
  }

  register(manager: import("./manager.js").SourceManager): void {
    manager.registerAddNotificationHook(this.createHook());
  }

  isTracked(notification: Notification): boolean {
    return this.trackedNotifications.has(notification);
  }

  dispose(): void {
    for (const timeoutId of this.timeouts.values()) {
      GLib.Source.remove(timeoutId);
    }
    this.timeouts.clear();
  }
}
