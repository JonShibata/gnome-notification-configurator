export class MockGLib {
	public PRIORITY_DEFAULT = 0;
	public SOURCE_REMOVE = false;

	private nextTimeoutId = 1;
	private timeouts = new Map<
		number,
		{ callback: () => boolean; interval: number }
	>();
	private removedTimeouts = new Set<number>();

	timeout_add(
		priority: number,
		interval: number,
		callback: () => boolean,
	): number {
		const id = this.nextTimeoutId++;
		this.timeouts.set(id, { callback, interval });
		return id;
	}

	Source = {
		remove: (id: number) => {
			this.removedTimeouts.add(id);
			this.timeouts.delete(id);
			return true;
		},
	};

	// Test helpers
	getTimeoutInterval(id: number): number | undefined {
		return this.timeouts.get(id)?.interval;
	}

	fireTimeout(id: number): void {
		const timeout = this.timeouts.get(id);
		if (timeout) {
			timeout.callback();
		}
	}

	wasTimeoutRemoved(id: number): boolean {
		return this.removedTimeouts.has(id);
	}

	getAllTimeoutIds(): number[] {
		return Array.from(this.timeouts.keys());
	}
}
