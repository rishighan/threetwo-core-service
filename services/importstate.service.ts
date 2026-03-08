/**
 * Import State Management Service
 * 
 * Centralized service for tracking import sessions, preventing race conditions,
 * and coordinating between file watcher, manual imports, and statistics updates.
 */

import { Service, ServiceBroker, Context } from "moleculer";
import { pubClient } from "../config/redis.config";

/**
 * Import session state
 */
interface ImportSession {
	sessionId: string;
	type: "full" | "incremental" | "watcher";
	status: "starting" | "scanning" | "queueing" | "active" | "completed" | "failed";
	startedAt: Date;
	lastActivityAt: Date;
	completedAt?: Date;
	stats: {
		totalFiles: number;
		filesQueued: number;
		filesProcessed: number;
		filesSucceeded: number;
		filesFailed: number;
	};
	directoryPath?: string;
}

export default class ImportStateService extends Service {
	private activeSessions: Map<string, ImportSession> = new Map();
	private watcherEnabled: boolean = true;

	public constructor(broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "importstate",
			actions: {
				/**
				 * Start a new import session
				 */
				startSession: {
					params: {
						sessionId: "string",
						type: { type: "enum", values: ["full", "incremental", "watcher"] },
						directoryPath: { type: "string", optional: true },
					},
					async handler(ctx: Context<{
						sessionId: string;
						type: "full" | "incremental" | "watcher";
						directoryPath?: string;
					}>) {
						const { sessionId, type, directoryPath } = ctx.params;

						// Check for active sessions (prevent race conditions)
						const activeSession = this.getActiveSession();
						if (activeSession && type !== "watcher") {
							throw new Error(
								`Cannot start ${type} import: Another import session "${activeSession.sessionId}" is already active (${activeSession.type})`
							);
						}

						// If starting manual import, temporarily disable watcher
						if (type !== "watcher") {
							this.logger.info(`[Import State] Disabling watcher for ${type} import`);
							this.watcherEnabled = false;
							await this.broker.broadcast("IMPORT_WATCHER_DISABLED", {
								reason: `${type} import started`,
								sessionId,
							});
						}

						const session: ImportSession = {
							sessionId,
							type,
							status: "starting",
							startedAt: new Date(),
							lastActivityAt: new Date(),
							stats: {
								totalFiles: 0,
								filesQueued: 0,
								filesProcessed: 0,
								filesSucceeded: 0,
								filesFailed: 0,
							},
							directoryPath,
						};

						this.activeSessions.set(sessionId, session);
						this.logger.info(`[Import State] Started session: ${sessionId} (${type})`);

						// Broadcast session started
						await this.broker.broadcast("IMPORT_SESSION_STARTED", {
							sessionId,
							type,
							startedAt: session.startedAt,
						});

						// Store in Redis for persistence
						await pubClient.set(
							`import:session:${sessionId}`,
							JSON.stringify(session),
							{ EX: 86400 } // 24 hour expiry
						);

						return session;
					},
				},

				/**
				 * Update session status
				 */
				updateSession: {
					params: {
						sessionId: "string",
						status: {
							type: "enum",
							values: ["starting", "scanning", "queueing", "active", "completed", "failed"],
							optional: true,
						},
						stats: { type: "object", optional: true },
					},
					async handler(ctx: Context<{
						sessionId: string;
						status?: ImportSession["status"];
						stats?: Partial<ImportSession["stats"]>;
					}>) {
						const { sessionId, status, stats } = ctx.params;
						const session = this.activeSessions.get(sessionId);

						if (!session) {
							throw new Error(`Session not found: ${sessionId}`);
						}

						if (status) {
							session.status = status;
						}

						if (stats) {
							session.stats = { ...session.stats, ...stats };
						}

						// Update Redis
						await pubClient.set(
							`import:session:${sessionId}`,
							JSON.stringify(session),
							{ EX: 86400 }
						);

						// Broadcast update
						await this.broker.broadcast("IMPORT_SESSION_UPDATED", {
							sessionId,
							status: session.status,
							stats: session.stats,
						});

						return session;
					},
				},

				/**
				 * Complete a session
				 */
				completeSession: {
					params: {
						sessionId: "string",
						success: "boolean",
					},
					async handler(ctx: Context<{
						sessionId: string;
						success: boolean;
					}>) {
						const { sessionId, success } = ctx.params;
						const session = this.activeSessions.get(sessionId);

						if (!session) {
							this.logger.warn(`[Import State] Session not found: ${sessionId}`);
							return null;
						}

						session.status = success ? "completed" : "failed";
						session.completedAt = new Date();

						this.logger.info(
							`[Import State] Completed session: ${sessionId} (${session.status})`
						);

						// Re-enable watcher if this was a manual import
						if (session.type !== "watcher") {
							this.watcherEnabled = true;
							this.logger.info("[Import State] Re-enabling watcher");
							await this.broker.broadcast("IMPORT_WATCHER_ENABLED", {
								sessionId,
							});
						}

						// Broadcast completion
						await this.broker.broadcast("IMPORT_SESSION_COMPLETED", {
							sessionId,
							type: session.type,
							success,
							stats: session.stats,
							duration: session.completedAt.getTime() - session.startedAt.getTime(),
						});

						// Update Redis with final state
						await pubClient.set(
							`import:session:${sessionId}:final`,
							JSON.stringify(session),
							{ EX: 604800 } // 7 day expiry for completed sessions
						);

						// Remove from active sessions
						this.activeSessions.delete(sessionId);


						return session;
					},
				},

				/**
				 * Get current session
				 */
				getSession: {
					params: {
						sessionId: "string",
					},
					async handler(ctx: Context<{ sessionId: string }>) {
						const { sessionId } = ctx.params;
						return this.activeSessions.get(sessionId) || null;
					},
				},

				/**
				 * Get active session (if any)
				 */
				getActiveSession: {
					async handler() {
						const session = this.getActiveSession();
						if (session) {
							// Format session for GraphQL response
							return {
								sessionId: session.sessionId,
								type: session.type,
								status: session.status,
								startedAt: session.startedAt.toISOString(),
								completedAt: session.completedAt?.toISOString() || null,
								stats: {
									totalFiles: session.stats.totalFiles,
									filesQueued: session.stats.filesQueued,
									filesProcessed: session.stats.filesProcessed,
									filesSucceeded: session.stats.filesSucceeded,
									filesFailed: session.stats.filesFailed,
								},
								directoryPath: session.directoryPath || null,
							};
						}
						return null;
					},
				},

				/**
				 * Check if watcher should process files
				 */
				isWatcherEnabled: {
					async handler() {
						return {
							enabled: this.watcherEnabled,
							activeSession: this.getActiveSession(),
						};
					},
				},

				/**
				 * Increment file processed counter
				 */
				incrementProcessed: {
					params: {
						sessionId: "string",
						success: "boolean",
					},
					async handler(ctx: Context<{
						sessionId: string;
						success: boolean;
					}>) {
						const { sessionId, success } = ctx.params;
						const session = this.activeSessions.get(sessionId);

						if (!session) {
							return null;
						}

						session.stats.filesProcessed++;
						session.lastActivityAt = new Date();
						if (success) {
							session.stats.filesSucceeded++;
						} else {
							session.stats.filesFailed++;
						}

						// Update Redis
						await pubClient.set(
							`import:session:${sessionId}`,
							JSON.stringify(session),
							{ EX: 86400 }
						);

						// Broadcast progress update
						await this.broker.broadcast("IMPORT_PROGRESS", {
							sessionId,
							stats: session.stats,
						});

						return session.stats;
					},
				},

				/**
				 * Get all active sessions
				 */
				getAllActiveSessions: {
					async handler() {
						return Array.from(this.activeSessions.values());
					},
				},
			},

			methods: {
				/**
				 * Get the currently active session (non-watcher)
				 */
				getActiveSession(): ImportSession | null {
					for (const session of this.activeSessions.values()) {
						if (
							session.type !== "watcher" &&
							["starting", "scanning", "queueing", "active"].includes(session.status)
						) {
							return session;
						}
					}
					return null;
				},
			},

			events: {
				/**
				 * Listen for job completion events from jobqueue
				 */
				"JOB_COMPLETED": {
					async handler(ctx: Context<{ sessionId?: string; success: boolean }>) {
						const { sessionId, success } = ctx.params;
						if (sessionId) {
							await this.actions.incrementProcessed({ sessionId, success });
						}
					},
				},
			},

			started: async () => {
				this.logger.info("[Import State] Service started");
				// Auto-complete stuck sessions every 5 minutes
				setInterval(() => {
					const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes without activity
					for (const [id, session] of this.activeSessions.entries()) {
						const idleMs = Date.now() - session.lastActivityAt.getTime();
						if (idleMs > IDLE_TIMEOUT) {
							this.logger.warn(`[Import State] Auto-expiring stuck session ${id} (idle ${Math.round(idleMs / 60000)}m)`);
							this.actions.completeSession({ sessionId: id, success: false });
						}
					}
				}, 5 * 60 * 1000);
			},
		});
	}
}
