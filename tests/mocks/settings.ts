import type { NotificationFilter } from "../../src/utils/settings.js";

export interface MockSettingsManager {
	filteringEnabled: boolean;
	autoRemovalTimeout: number;
	notificationTimeout: number;
	getFilterFor: (
		notification: any,
		source: string,
	) => NotificationFilter["action"] | null;
	events: any;
}

export function createMockSettingsManager(
	overrides?: Partial<MockSettingsManager>,
): MockSettingsManager {
	return {
		filteringEnabled: true,
		autoRemovalTimeout: 5000,
		notificationTimeout: 4000,
		getFilterFor: () => null,
		events: { on: () => {}, off: () => {}, emit: () => {} },
		...overrides,
	};
}
