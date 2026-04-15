/**
 * Mock services for file watcher e2e tests
 * Provides mock implementations of Moleculer services
 */
import { ServiceBroker, Context, ServiceSchema } from "moleculer";
import { EventCapturer } from "./test-helpers";

/**
 * Mock call tracking interface
 */
export interface MockCall {
	action: string;
	params: any;
	timestamp: number;
}

/**
 * Mock broker wrapper that tracks all calls and events
 */
export class MockBrokerWrapper {
	public broker: ServiceBroker;
	public calls: MockCall[] = [];
	public eventCapturer: EventCapturer;
	private mockResponses: Map<string, any> = new Map();

	constructor() {
		this.eventCapturer = new EventCapturer();
		this.broker = new ServiceBroker({
			logger: false, // Suppress logs during tests
			transporter: null, // No actual transport needed
		});
	}

	/**
	 * Configures a mock response for a specific action
	 */
	mockResponse(action: string, response: any): void {
		this.mockResponses.set(action, response);
	}

	/**
	 * Gets all calls made to a specific action
	 */
	getCallsTo(action: string): MockCall[] {
		return this.calls.filter((c) => c.action === action);
	}

	/**
	 * Checks if an action was called
	 */
	wasCalled(action: string): boolean {
		return this.calls.some((c) => c.action === action);
	}

	/**
	 * Clears all recorded calls
	 */
	clearCalls(): void {
		this.calls = [];
	}

	/**
	 * Starts the broker
	 */
	async start(): Promise<void> {
		await this.broker.start();
	}

	/**
	 * Stops the broker
	 */
	async stop(): Promise<void> {
		await this.broker.stop();
	}
}

/**
 * Creates a mock socket service that captures broadcast events
 */
export function createMockSocketService(wrapper: MockBrokerWrapper): ServiceSchema {
	return {
		name: "socket",
		actions: {
			broadcast(ctx: Context<{ namespace: string; event: string; args: any[] }>) {
				const { event, args } = ctx.params;
				wrapper.calls.push({
					action: "socket.broadcast",
					params: ctx.params,
					timestamp: Date.now(),
				});
				wrapper.eventCapturer.capture(event, ...args);
				return { success: true };
			},
			broadcastLibraryStatistics(ctx: Context<{ directoryPath?: string }>) {
				wrapper.calls.push({
					action: "socket.broadcastLibraryStatistics",
					params: ctx.params,
					timestamp: Date.now(),
				});
				return { success: true };
			},
		},
	};
}

/**
 * Creates a mock library service that tracks database operations
 */
export function createMockLibraryService(wrapper: MockBrokerWrapper): ServiceSchema {
	return {
		name: "library",
		actions: {
			markFileAsMissing(ctx: Context<{ filePath: string }>) {
				const { filePath } = ctx.params;
				wrapper.calls.push({
					action: "library.markFileAsMissing",
					params: ctx.params,
					timestamp: Date.now(),
				});

				// Return a mock response simulating comics being marked as missing
				const mockResult = {
					marked: 1,
					missingComics: [
						{
							_id: "mock-id-123",
							rawFileDetails: {
								name: "Test Comic",
								filePath,
							},
						},
					],
				};
				return mockResult;
			},
			clearFileMissingFlag(ctx: Context<{ filePath: string }>) {
				wrapper.calls.push({
					action: "library.clearFileMissingFlag",
					params: ctx.params,
					timestamp: Date.now(),
				});
				return { success: true };
			},
			getImportStatistics(ctx: Context<{ directoryPath?: string }>) {
				wrapper.calls.push({
					action: "library.getImportStatistics",
					params: ctx.params,
					timestamp: Date.now(),
				});
				return {
					success: true,
					directory: ctx.params.directoryPath || "/comics",
					stats: {
						totalLocalFiles: 10,
						alreadyImported: 5,
						newFiles: 5,
						missingFiles: 0,
						percentageImported: "50.00%",
					},
				};
			},
		},
	};
}

/**
 * Creates a mock importstate service
 */
export function createMockImportStateService(wrapper: MockBrokerWrapper): ServiceSchema {
	let watcherEnabled = true;

	return {
		name: "importstate",
		actions: {
			isWatcherEnabled() {
				wrapper.calls.push({
					action: "importstate.isWatcherEnabled",
					params: {},
					timestamp: Date.now(),
				});
				return { enabled: watcherEnabled };
			},
			startSession(ctx: Context<{ sessionId: string; type: string; directoryPath?: string }>) {
				wrapper.calls.push({
					action: "importstate.startSession",
					params: ctx.params,
					timestamp: Date.now(),
				});
				if (ctx.params.type !== "watcher") {
					watcherEnabled = false;
				}
				return { success: true };
			},
			completeSession(ctx: Context<{ sessionId: string; success: boolean }>) {
				wrapper.calls.push({
					action: "importstate.completeSession",
					params: ctx.params,
					timestamp: Date.now(),
				});
				watcherEnabled = true;
				return { success: true };
			},
		},
	};
}

/**
 * Sets up a complete mock broker with all services registered
 */
export async function setupMockBroker(): Promise<MockBrokerWrapper> {
	const wrapper = new MockBrokerWrapper();

	// Create and register mock services
	wrapper.broker.createService(createMockSocketService(wrapper));
	wrapper.broker.createService(createMockLibraryService(wrapper));
	wrapper.broker.createService(createMockImportStateService(wrapper));

	await wrapper.start();
	return wrapper;
}

/**
 * Tears down the mock broker
 */
export async function teardownMockBroker(wrapper: MockBrokerWrapper): Promise<void> {
	await wrapper.stop();
}
