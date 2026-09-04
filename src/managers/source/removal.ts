import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";
import GLib from "gi://GLib";
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
			const sourceTitle = notification.source?.title ?? source.title ?? "UNK_SRC";

			if (settingsManager.filteringEnabled) {
				const filterAction = settingsManager.getFilterFor(
					sourceTitle,
					notification.title ?? "",
					notification.body ?? "",
				);

				// Log ALL notifications to see what's happening
				log(
					`[RemovalAdapter] Notification from '${sourceTitle}' - filter action: ${filterAction ?? "none"}`,
				);

				if (filterAction === "show-and-remove") {
					// Mark this notification as tracked for show-and-remove
					trackedNotifications.add(notification);
					const notificationStartTime = Date.now();
					log(
						`[RemovalAdapter] Tracking notification from '${sourceTitle}' for auto-removal`,
					);

					const timeout = settingsManager.autoRemovalTimeout;
					log(`[RemovalAdapter] Auto-removal timeout setting: ${timeout}ms`);

					// Prevent the notification from being acknowledged
					// by intercepting the acknowledged property setter
					const notifAny = notification as any;
					let wasAcknowledged = notifAny.acknowledged || false;
					let preventAcknowledgement = true;

					// Save the original acknowledged value
					const originalAcknowledgedDescriptor = Object.getOwnPropertyDescriptor(
						notification,
						"acknowledged",
					);

					// Override the acknowledged property
					Object.defineProperty(notification, "acknowledged", {
						get() {
							if (originalAcknowledgedDescriptor?.get) {
								return originalAcknowledgedDescriptor.get.call(this);
							}
							return wasAcknowledged;
						},
						set(value: boolean) {
							if (preventAcknowledgement && value === true) {
								const elapsed = Date.now() - notificationStartTime;
								log(
									`[RemovalAdapter] ⚠ Blocked acknowledgement attempt after ${elapsed}ms - keeping banner visible`,
								);
								return; // Block the acknowledgement
							}
							if (value && !wasAcknowledged) {
								const elapsed = Date.now() - notificationStartTime;
								log(
									`[RemovalAdapter] ⚠ Notification acknowledged (banner hidden) after ${elapsed}ms`,
								);
							}
							wasAcknowledged = value;
							if (originalAcknowledgedDescriptor?.set) {
								originalAcknowledgedDescriptor.set.call(this, value);
							}
						},
						configurable: true,
						enumerable: true,
					});

					const checkAcknowledged = () => {
						// No longer needed with property interception
					};

					if (timeout > 0) {
						const startTime = notificationStartTime;
						let timeoutFired = false;

						// Poll for acknowledged state changes every 500ms
						const pollInterval = GLib.timeout_add(
							GLib.PRIORITY_DEFAULT,
							500,
							() => {
								checkAcknowledged();
								return !timeoutFired; // Continue until main timeout fires
							},
						);

						const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
							const elapsed = Date.now() - startTime;
							timeoutFired = true;

							// Log notification state before destroying
							const notifAny = notification as any;
							const acknowledged = notifAny.acknowledged ?? "unknown";
							const resident = notifAny.resident ?? "unknown";
							const destroyedFlag = notifAny._destroyed ?? "unknown";

							log(
								`[RemovalAdapter] ✓ Auto-removal timeout fired after ${elapsed}ms (expected ${timeout}ms)`,
							);
							log(
								`[RemovalAdapter]   Notification state: acknowledged=${acknowledged}, resident=${resident}, _destroyed=${destroyedFlag}`,
							);

							// Stop preventing acknowledgement and restore original property
							preventAcknowledgement = false;
							if (originalAcknowledgedDescriptor) {
								Object.defineProperty(
									notification,
									"acknowledged",
									originalAcknowledgedDescriptor,
								);
							}

							notification.destroy();
							timeouts.delete(notification);
							trackedNotifications.delete(notification);
							GLib.Source.remove(pollInterval);
							return GLib.SOURCE_REMOVE;
						});

						log(
							`[RemovalAdapter] Timeout ID ${timeoutId} registered for ${timeout}ms`,
						);
						timeouts.set(notification, timeoutId);

						const originalDestroy = notification.destroy.bind(notification);
						notification.destroy = function () {
							const existingTimeout = timeouts.get(notification);
							if (existingTimeout !== undefined) {
								const elapsed = Date.now() - startTime;
								if (!timeoutFired) {
									log(
										`[RemovalAdapter] ✗ Notification destroyed externally after ${elapsed}ms (before ${timeout}ms timeout) - canceling auto-removal`,
									);
								}

								// Restore original property descriptor
								preventAcknowledgement = false;
								if (originalAcknowledgedDescriptor) {
									Object.defineProperty(
										notification,
										"acknowledged",
										originalAcknowledgedDescriptor,
									);
								}

								GLib.Source.remove(existingTimeout);
								GLib.Source.remove(pollInterval);
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
