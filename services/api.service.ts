import chokidar, { FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";
import debounce from "lodash/debounce";
import { IFolderData } from "threetwo-ui-typings";

/**
 * Import statistics cache for real-time updates
 */
interface ImportStatisticsCache {
  totalLocalFiles: number;
  alreadyImported: number;
  newFiles: number;
  percentageImported: string;
  lastUpdated: Date;
  pendingFiles: Set<string>; // Files in stabilization period
}

/**
 * ApiService exposes REST endpoints and watches the comics directory for changes.
 * It uses chokidar to monitor filesystem events and broadcasts them via the Moleculer broker.
 * @extends Service
 */
export default class ApiService extends Service {
  /**
   * The chokidar file system watcher instance.
   * @private
   */
  private fileWatcher?: any;

  /**
   * Import statistics cache for real-time updates
   * @private
   */
  private statsCache: ImportStatisticsCache | null = null;

  /**
   * Debounced function to broadcast statistics updates
   * @private
   */
  private broadcastStatsUpdate?: ReturnType<typeof debounce>;

  /**
   * Creates an instance of ApiService.
   * @param {ServiceBroker} broker - The Moleculer service broker instance.
   */
  public constructor(broker: ServiceBroker) {
    super(broker);
    this.parseServiceSchema({
      name: "api",
      mixins: [ApiGateway],
      settings: {
        port: process.env.PORT || 3000,
        routes: [
          {
            path: "/api",
            whitelist: ["**"],
            cors: {
              origin: "*",
              methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
              allowedHeaders: ["*"],
              exposedHeaders: [],
              credentials: false,
              maxAge: 3600,
            },
            use: [],
            mergeParams: true,
            authentication: false,
            authorization: false,
            autoAliases: true,
            aliases: {},
            callingOptions: {},
            bodyParsers: {
              json: { strict: false, limit: "1MB" },
              urlencoded: { extended: true, limit: "1MB" },
            },
            mappingPolicy: "all",
            logging: true,
          },
          {
            path: "/graphql",
            cors: {
              origin: "*",
              methods: ["GET", "OPTIONS", "POST"],
              allowedHeaders: ["*"],
              exposedHeaders: [],
              credentials: false,
              maxAge: 3600,
            },
            aliases: {
              "POST /": "graphql.graphql",
              "GET /": "graphql.graphql",
              "GET /health": "graphql.checkRemoteSchema",
            },
            mappingPolicy: "restrict",
            bodyParsers: {
              json: { strict: false, limit: "1MB" },
            },
          },
          {
            path: "/userdata",
            cors: {
              origin: "*",
              methods: ["GET", "OPTIONS"],
              allowedHeaders: ["*"],
              exposedHeaders: [],
              credentials: false,
              maxAge: 3600,
            },
            use: [ApiGateway.serveStatic(path.resolve("./userdata"))],
          },
          {
            path: "/comics",
            cors: {
              origin: "*",
              methods: ["GET", "OPTIONS"],
              allowedHeaders: ["*"],
              exposedHeaders: [],
              credentials: false,
              maxAge: 3600,
            },
            use: [ApiGateway.serveStatic(path.resolve("./comics"))],
          },
          {
            path: "/logs",
            use: [ApiGateway.serveStatic("logs")],
          },
        ],
        log4XXResponses: false,
        logRequestParams: true,
        logResponseData: true,
        assets: { folder: "public", options: {} },
      },
      events: {},
      actions: {
        /**
         * Get cached import statistics (fast, no filesystem scan)
         * @returns Cached statistics or null if not initialized
         */
        getCachedImportStatistics: {
          rest: "GET /cachedImportStatistics",
          async handler() {
            // If cache not initialized, try to initialize it now
            if (!this.statsCache) {
              this.logger.info("[Stats Cache] Cache not initialized, initializing now...");
              try {
                await this.initializeStatsCache();
              } catch (error) {
                this.logger.error("[Stats Cache] Failed to initialize:", error);
                return {
                  success: false,
                  message: "Failed to initialize statistics cache",
                  stats: null,
                  lastUpdated: null,
                };
              }
            }

            // Check again after initialization attempt
            if (!this.statsCache) {
              return {
                success: false,
                message: "Statistics cache not initialized yet",
                stats: null,
                lastUpdated: null,
              };
            }

            return {
              success: true,
              stats: {
                totalLocalFiles: this.statsCache.totalLocalFiles,
                alreadyImported: this.statsCache.alreadyImported,
                newFiles: this.statsCache.newFiles,
                percentageImported: this.statsCache.percentageImported,
                pendingFiles: this.statsCache.pendingFiles.size,
              },
              lastUpdated: this.statsCache.lastUpdated.toISOString(),
            };
          },
        },

        /**
         * Invalidate statistics cache (force refresh on next request)
         */
        invalidateStatsCache: {
          async handler() {
            this.logger.info("[Stats Cache] Invalidating cache...");
            await this.initializeStatsCache();
            return { success: true, message: "Cache invalidated and refreshed" };
          },
        },
      },
      methods: {
        /**
         * Initialize statistics cache by fetching current import statistics
         * @private
         */
        initializeStatsCache: async function() {
          try {
            this.logger.info("[Stats Cache] Initializing import statistics cache...");
            const stats = await this.broker.call("library.getImportStatistics", {});
            
            if (stats && stats.success) {
              this.statsCache = {
                totalLocalFiles: stats.stats.totalLocalFiles,
                alreadyImported: stats.stats.alreadyImported,
                newFiles: stats.stats.newFiles,
                percentageImported: stats.stats.percentageImported,
                lastUpdated: new Date(),
                pendingFiles: new Set<string>(),
              };
              this.logger.info("[Stats Cache] Cache initialized successfully");
            }
          } catch (error) {
            this.logger.error("[Stats Cache] Failed to initialize cache:", error);
          }
        },

        /**
         * Update statistics cache when files are added or removed
         * @param event - File event type ('add' or 'unlink')
         * @param filePath - Path to the file
         * @private
         */
        updateStatsCache: function(event: string, filePath: string) {
          if (!this.statsCache) return;

          const fileExtension = path.extname(filePath);
          const isComicFile = [".cbz", ".cbr", ".cb7"].includes(fileExtension);
          
          if (!isComicFile) return;

          if (event === "add") {
            // Add to pending files (in stabilization period)
            this.statsCache.pendingFiles.add(filePath);
            this.statsCache.totalLocalFiles++;
            this.statsCache.newFiles++;
          } else if (event === "unlink") {
            // Remove from pending if it was there
            this.statsCache.pendingFiles.delete(filePath);
            this.statsCache.totalLocalFiles--;
            // Could be either new or already imported, but we'll decrement newFiles for safety
            if (this.statsCache.newFiles > 0) {
              this.statsCache.newFiles--;
            }
          }

          // Recalculate percentage
          if (this.statsCache.totalLocalFiles > 0) {
            const percentage = ((this.statsCache.alreadyImported / this.statsCache.totalLocalFiles) * 100).toFixed(2);
            this.statsCache.percentageImported = `${percentage}%`;
          } else {
            this.statsCache.percentageImported = "0.00%";
          }

          this.statsCache.lastUpdated = new Date();

          // Trigger debounced broadcast
          if (this.broadcastStatsUpdate) {
            this.broadcastStatsUpdate();
          }
        },

        /**
         * Broadcast statistics update via Socket.IO
         * @private
         */
        broadcastStats: async function() {
          if (!this.statsCache) return;

          try {
            await this.broker.call("socket.broadcast", {
              namespace: "/",
              event: "IMPORT_STATISTICS_UPDATED",
              args: [{
                stats: {
                  totalLocalFiles: this.statsCache.totalLocalFiles,
                  alreadyImported: this.statsCache.alreadyImported,
                  newFiles: this.statsCache.newFiles,
                  percentageImported: this.statsCache.percentageImported,
                  pendingFiles: this.statsCache.pendingFiles.size,
                },
                lastUpdated: this.statsCache.lastUpdated.toISOString(),
              }],
            });
            this.logger.debug("[Stats Cache] Broadcasted statistics update");
          } catch (error) {
            this.logger.error("[Stats Cache] Failed to broadcast statistics:", error);
          }
        },

        /**
         * Mark a file as imported (moved from pending to imported)
         * @param filePath - Path to the imported file
         * @private
         */
        markFileAsImported: function(filePath: string) {
          if (!this.statsCache) return;

          this.statsCache.pendingFiles.delete(filePath);
          this.statsCache.alreadyImported++;
          if (this.statsCache.newFiles > 0) {
            this.statsCache.newFiles--;
          }

          // Recalculate percentage
          if (this.statsCache.totalLocalFiles > 0) {
            const percentage = ((this.statsCache.alreadyImported / this.statsCache.totalLocalFiles) * 100).toFixed(2);
            this.statsCache.percentageImported = `${percentage}%`;
          }

          this.statsCache.lastUpdated = new Date();

          // Trigger debounced broadcast
          if (this.broadcastStatsUpdate) {
            this.broadcastStatsUpdate();
          }
        },
      },
      started: this.startWatcher,
      stopped: this.stopWatcher,
    });
  }

  /**
   * Initializes and starts the chokidar watcher on the COMICS_DIRECTORY.
   * Debounces rapid events and logs initial scan completion.
   * @private
   */
  private async startWatcher(): Promise<void> {
    const rawDir = process.env.COMICS_DIRECTORY;
    if (!rawDir) {
      this.logger.error("COMICS_DIRECTORY not set; cannot start watcher");
      return;
    }
    const watchDir = path.resolve(rawDir);
    this.logger.info(`Watching comics folder at: ${watchDir}`);
    if (!fs.existsSync(watchDir)) {
      this.logger.error(`✖ Comics folder does not exist: ${watchDir}`);
      return;
    }

    // Initialize debounced broadcast function (2 second debounce for statistics updates)
    this.broadcastStatsUpdate = debounce(
      () => {
        this.broadcastStats();
      },
      2000,
      { leading: false, trailing: true }
    );

    // Initialize statistics cache (async, but don't block watcher startup)
    this.initializeStatsCache().catch(err => {
      this.logger.error("[Stats Cache] Failed to initialize on startup:", err);
    });

    this.fileWatcher = chokidar.watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: true,
      depth: 10,
      usePolling: true,
      interval: 5000,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      ignored: (p) => p.endsWith(".dctmp") || p.includes("/.git/"),
    });

    /**
     * Debounced handler for file system events, batching rapid triggers
     * into a 200ms window. Leading and trailing calls invoked.
     * @param {string} event - Type of file event (add, change, etc.).
     * @param {string} p - Path of the file or directory.
     * @param {fs.Stats} [stats] - Optional file stats for add/change events.
     */
    const debouncedEvent = debounce(
      (event: string, p: string, stats?: fs.Stats) => {
        try {
          this.handleFileEvent(event, p, stats);
        } catch (err) {
          this.logger.error(
            `Error handling file event [${event}] for ${p}:`,
            err
          );
        }
      },
      200,
      { leading: true, trailing: true }
    );

    this.fileWatcher
      .on("ready", () => this.logger.info("Initial scan complete."))
      .on("error", (err) => this.logger.error("Watcher error:", err))
      .on("add", (p, stats) => debouncedEvent("add", p, stats))
      .on("change", (p, stats) => debouncedEvent("change", p, stats))
      .on("unlink", (p) => debouncedEvent("unlink", p))
      .on("addDir", (p) => debouncedEvent("addDir", p))
      .on("unlinkDir", (p) => debouncedEvent("unlinkDir", p));
  }

  /**
   * Stops and closes the chokidar watcher, freeing resources.
   * @private
   */
  private async stopWatcher(): Promise<void> {
    if (this.fileWatcher) {
      this.logger.info("Stopping file watcher...");
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
  }

  /**
   * Handles a filesystem event by logging and optionally importing new files.
   * @param event - The type of chokidar event ('add', 'change', 'unlink', etc.).
   * @param filePath - The full path of the file or directory that triggered the event.
   * @param stats - Optional fs.Stats data for 'add' or 'change' events.
   * @private
   */
  private async handleFileEvent(
    event: string,
    filePath: string,
    stats?: fs.Stats
  ): Promise<void> {
    this.logger.info(`File event [${event}]: ${filePath}`);
    
    // Update statistics cache for add/unlink events
    if (event === "add" || event === "unlink") {
      this.updateStatsCache(event, filePath);
    }
    
    if (event === "add" && stats) {
      setTimeout(async () => {
        try {
          const newStats = await fs.promises.stat(filePath);
          if (newStats.mtime.getTime() === stats.mtime.getTime()) {
            this.logger.info(`Stable file detected: ${filePath}, importing.`);
            
            const folderData: IFolderData[] = await this.broker.call(
              "library.walkFolders",
              { basePathToWalk: filePath }
            );
            
            if (folderData && folderData.length > 0) {
              const fileData = folderData[0];
              const fileName = path.basename(filePath, path.extname(filePath));
              const extension = path.extname(filePath);
              
              // Determine mimeType based on extension
              let mimeType = "application/octet-stream";
              if (extension === ".cbz") {
                mimeType = "application/zip; charset=binary";
              } else if (extension === ".cbr") {
                mimeType = "application/x-rar-compressed; charset=binary";
              }
              
              // Prepare payload for rawImportToDB
              const payload = {
                rawFileDetails: {
                  name: fileName,
                  filePath: filePath,
                  fileSize: fileData.fileSize,
                  extension: extension,
                  mimeType: mimeType,
                },
                inferredMetadata: {
                  issue: {
                    name: fileName,
                    number: 0,
                  },
                },
                sourcedMetadata: {
                  comicInfo: null,
                },
                importStatus: {
                  isImported: true,
                  tagged: false,
                  matchedResult: {
                    score: "0",
                  },
                },
                acquisition: {
                  source: {
                    wanted: false,
                  },
                },
              };
              
              // Call the library service to import the comic
              await this.broker.call("library.rawImportToDB", {
                importType: "new",
                payload: payload,
              });
              
              this.logger.info(`Successfully queued import for: ${filePath}`);
              
              // Mark file as imported in statistics cache
              this.markFileAsImported(filePath);
            }
          }
        } catch (error) {
          this.logger.error(`Error importing file ${filePath}:`, error);
        }
      }, 3000);
    }
    
    // Broadcast file system event
    this.broker.broadcast(event, { path: filePath });
  }
}
