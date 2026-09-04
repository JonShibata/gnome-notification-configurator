import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { RemovalAdapter } from "../source/removal.js";

export class BannerVisibilityAdapter {
	private originalHideNotification?: (animate?: boolean) => void;

	constructor(
		private settingsManager: SettingsManager,
		private removalAdapter: RemovalAdapter,
	) {}

	enable(): void {
		const removalAdapter = this.removalAdapter;
		const messageTrayProto = MessageTray.MessageTray
			.prototype as unknown as any;

		// Save the original _hideNotification method
		this.originalHideNotification = messageTrayProto._hideNotification;
		const originalHideNotification = this.originalHideNotification;

		// Override _hideNotification to prevent hiding tracked notifications
		messageTrayProto._hideNotification = function (animate?: boolean) {
			const notification = this._notification;
			const sourceTitle = notification?.source?.title ?? "unknown";
			const isTracked = notification && removalAdapter.isTracked(notification);

			log(
				`[BannerVisibilityAdapter] _hideNotification called for '${sourceTitle}' (tracked: ${isTracked})`,
			);

			if (isTracked) {
				log(
					`[BannerVisibilityAdapter] BLOCKING banner hide for show-and-remove notification`,
				);
				return; // Don't hide the banner
			}

			// For all other notifications, proceed normally
			log(`[BannerVisibilityAdapter] Allowing banner hide for '${sourceTitle}'`);
			return originalHideNotification?.call(this, animate);
		};
	}

	disable(): void {
		const messageTrayProto = MessageTray.MessageTray
			.prototype as unknown as any;

		if (this.originalHideNotification) {
			messageTrayProto._hideNotification = this.originalHideNotification;
			this.originalHideNotification = undefined;
		}
	}

	register(manager: import("./manager.js").MessageTrayManager): void {
		// No longer using hooks, we patch directly
	}

	dispose(): void {
		this.disable();
	}
}
