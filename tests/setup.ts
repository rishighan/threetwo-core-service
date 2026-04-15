/**
 * Jest global setup for file watcher e2e tests
 * @jest-environment node
 */
import { jest, beforeAll, afterAll } from "@jest/globals";

// Increase Jest timeout for e2e tests that involve file system operations
jest.setTimeout(30000);

// Suppress console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
	const originalConsole = { ...console };
	beforeAll(() => {
		console.log = jest.fn() as typeof console.log;
		console.info = jest.fn() as typeof console.info;
		// Keep error and warn for debugging
	});
	afterAll(() => {
		console.log = originalConsole.log;
		console.info = originalConsole.info;
	});
}

export {};
