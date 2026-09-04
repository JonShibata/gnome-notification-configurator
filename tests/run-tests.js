#!/usr/bin/env node

import { runTests } from "../dist/tests/managers/source/removal.test.js";

async function main() {
	console.log("=".repeat(50));
	console.log("GNOME Notification Configurator - Test Suite");
	console.log("=".repeat(50) + "\n");

	try {
		await runTests();
	} catch (error) {
		console.error("Fatal error running tests:", error);
		process.exit(1);
	}
}

main();
