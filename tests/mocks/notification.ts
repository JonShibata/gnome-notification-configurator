export interface MockNotification {
	title?: string;
	body?: string;
	source?: { title: string };
	acknowledged: boolean;
	destroy: () => void;
	_destroyed?: boolean;
}

export function createMockNotification(
	title = "Test",
	body = "Test body",
	appName = "TestApp",
): MockNotification {
	const notification: MockNotification = {
		title,
		body,
		source: { title: appName },
		acknowledged: false,
		_destroyed: false,
		destroy: function () {
			this._destroyed = true;
		},
	};
	return notification;
}
