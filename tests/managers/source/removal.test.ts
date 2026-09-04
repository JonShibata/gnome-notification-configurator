import { RemovalAdapter } from "../../../src/managers/source/removal.js";
import { MockGLib } from "../../mocks/glib.js";
import {
	createMockNotification,
	type MockNotification,
} from "../../mocks/notification.js";
import {
	createMockSettingsManager,
	type MockSettingsManager,
} from "../../mocks/settings.js";

// Simple test framework
interface TestContext {
	adapter: RemovalAdapter;
	mockGLib: MockGLib;
	mockSettings: MockSettingsManager;
	originalGLib: any;
}

interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
}

const tests: Array<{
	name: string;
	fn: (ctx: TestContext) => void | Promise<void>;
}> = [];
const results: TestResult[] = [];

function test(
	name: string,
	fn: (ctx: TestContext) => void | Promise<void>,
): void {
	tests.push({ name, fn });
}

function expect(actual: any) {
	return {
		toBe(expected: any) {
			if (actual !== expected) {
				throw new Error(
					`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
				);
			}
		},
		toBeGreaterThan(expected: number) {
			if (actual <= expected) {
				throw new Error(`Expected ${actual} to be greater than ${expected}`);
			}
		},
		toHaveBeenCalled() {
			if (!actual || typeof actual !== "function") {
				throw new Error("Expected a function");
			}
			// Simple mock tracking - check if _destroyed flag was set
			// This is a workaround since we don't have a full mocking library
		},
	};
}

// Setup and teardown helpers
function createTestContext(): TestContext {
	const mockGLib = new MockGLib();
	const originalGLib = (globalThis as any).GLib;
	(globalThis as any).GLib = mockGLib;

	const mockSettings = createMockSettingsManager({
		filteringEnabled: true,
		autoRemovalTimeout: 10000, // 10 seconds
		getFilterFor: () => "show-and-remove",
	});

	const adapter = new RemovalAdapter(mockSettings as any);

	return { adapter, mockGLib, mockSettings, originalGLib };
}

function cleanupTestContext(ctx: TestContext): void {
	(globalThis as any).GLib = ctx.originalGLib;
	ctx.adapter.dispose();
}

// Test: timeout value verification - exact value from settings
test("should use exact timeout value from settings (not scaled)", (ctx) => {
	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	expect(timeoutIds.length).toBe(1);

	// CRITICAL TEST: Verify timeout is exactly 10000ms, not 10ms or 10000000ms
	const actualInterval = ctx.mockGLib.getTimeoutInterval(timeoutIds[0]);
	expect(actualInterval).toBe(10000);
});

// Test: timeout value in milliseconds
test("should pass timeout value in milliseconds (not seconds)", (ctx) => {
	ctx.mockSettings.autoRemovalTimeout = 5000; // 5 seconds

	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	const actualInterval = ctx.mockGLib.getTimeoutInterval(timeoutIds[0]);

	// Should be 5000 (milliseconds), not 5 (seconds)
	expect(actualInterval).toBe(5000);
});

// Test: only for show-and-remove notifications
test("should create timeout only for show-and-remove notifications", (ctx) => {
	ctx.mockSettings.getFilterFor = () => null; // Not a show-and-remove notification

	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	expect(timeoutIds.length).toBe(0);
});

// Test: no timeout when set to 0
test("should not create timeout when autoRemovalTimeout is 0", (ctx) => {
	ctx.mockSettings.autoRemovalTimeout = 0;

	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	expect(timeoutIds.length).toBe(0);
});

// Test: destroy called when timeout fires
test("should call notification.destroy() when timeout fires", (ctx) => {
	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();

	// Fire the timeout
	ctx.mockGLib.fireTimeout(timeoutIds[0]);

	expect(notification._destroyed).toBe(true);
});

// Test: cleanup on early destroy
test("should remove timeout when notification destroyed early", (ctx) => {
	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	const timeoutId = timeoutIds[0];

	// Manually destroy notification
	notification.destroy();

	// Verify timeout was removed
	expect(ctx.mockGLib.wasTimeoutRemoved(timeoutId)).toBe(true);
});

// Test: dispose cleanup
test("should clean up all timeouts on dispose", (ctx) => {
	const hook = ctx.adapter.createHook();

	// Create multiple notifications with timeouts
	for (let i = 0; i < 3; i++) {
		const notification = createMockNotification(`Test ${i}`);
		hook(
			() => {},
			notification as any,
			{ source: { title: "App" } as any, block: () => {} },
		);
	}

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	expect(timeoutIds.length).toBe(3);

	// Dispose adapter
	ctx.adapter.dispose();

	// All timeouts should be removed
	for (const id of timeoutIds) {
		expect(ctx.mockGLib.wasTimeoutRemoved(id)).toBe(true);
	}
});

// Test: large timeout values
test("should handle very large timeout values", (ctx) => {
	ctx.mockSettings.autoRemovalTimeout = 60000; // 60 seconds (max value)

	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	const actualInterval = ctx.mockGLib.getTimeoutInterval(timeoutIds[0]);
	expect(actualInterval).toBe(60000);
});

// Test: small timeout values
test("should handle very small timeout values", (ctx) => {
	ctx.mockSettings.autoRemovalTimeout = 100; // 100ms

	const hook = ctx.adapter.createHook();
	const notification = createMockNotification();

	hook(
		() => {},
		notification as any,
		{ source: { title: "App" } as any, block: () => {} },
	);

	const timeoutIds = ctx.mockGLib.getAllTimeoutIds();
	const actualInterval = ctx.mockGLib.getTimeoutInterval(timeoutIds[0]);
	expect(actualInterval).toBe(100);
});

// Test runner
async function runTests(): Promise<void> {
	console.log("Running RemovalAdapter tests...\n");

	for (const { name, fn } of tests) {
		const ctx = createTestContext();
		try {
			await fn(ctx);
			results.push({ name, passed: true });
			console.log(`✓ ${name}`);
		} catch (error) {
			results.push({
				name,
				passed: false,
				error: error instanceof Error ? error.message : String(error),
			});
			console.log(`✗ ${name}`);
			console.log(`  ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			cleanupTestContext(ctx);
		}
	}

	console.log("\n" + "=".repeat(50));
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);

	if (failed > 0) {
		process.exit(1);
	}
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
	runTests().catch((error) => {
		console.error("Test runner error:", error);
		process.exit(1);
	});
}

export { runTests };
