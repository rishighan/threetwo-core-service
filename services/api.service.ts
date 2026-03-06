import chokidar, { FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import { Service, ServiceBroker, ServiceSchema, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import debounce from "lodash/debounce";
import { IFolderData } from "threetwo-ui-typings";

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
      events: {
        /**
         * Listen for watcher disable events
         */
        "IMPORT_WATCHER_DISABLED": {
          async handler(ctx: Context<{ reason: string; sessionId: string }>) {
            const { reason, sessionId } = ctx.params;
            this.logger.info(`[Watcher] Disabled: ${reason} (session: ${sessionId})`);
            
            // Broadcast to frontend
            await this.broker.call("socket.broadcast", {
              namespace: "/",
              event: "IMPORT_WATCHER_STATUS",
              args: [{
                enabled: false,
                reason,
                sessionId,
              }],
            });
          },
        },

        /**
         * Listen for watcher enable events
         */
        "IMPORT_WATCHER_ENABLED": {
          async handler(ctx: Context<{ sessionId: string }>) {
            const { sessionId } = ctx.params;
            this.logger.info(`[Watcher] Re-enabled after session: ${sessionId}`);
            
            // Broadcast to frontend
            await this.broker.call("socket.broadcast", {
              namespace: "/",
              event: "IMPORT_WATCHER_STATUS",
              args: [{
                enabled: true,
                sessionId,
              }],
            });
          },
        },
      },
      actions: {},
      methods: {},
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
   
   // Check if watcher should process files (not during manual imports)
   if (event === "add") {
   	const watcherState: any = await this.broker.call("importstate.isWatcherEnabled");
   	if (!watcherState.enabled) {
   		this.logger.info(
   			`[Watcher] Skipping file ${filePath} - manual import in progress (${watcherState.activeSession?.sessionId})`
   		);
   		return;
   	}
   }
   
   if (event === "add" && stats) {
      setTimeout(async () => {
      	try {
      		// Double-check watcher is still enabled
      		const watcherState: any = await this.broker.call("importstate.isWatcherEnabled");
      		if (!watcherState.enabled) {
      			this.logger.info(
      				`[Watcher] Skipping delayed import for ${filePath} - manual import started`
      			);
      			return;
      		}
      		
      		const newStats = await fs.promises.stat(filePath);
      		if (newStats.mtime.getTime() === stats.mtime.getTime()) {
      			this.logger.info(`Stable file detected: ${filePath}, importing.`);
      			
      			// Create a watcher session for this file
      			const sessionId = `watcher-${Date.now()}`;
      			await this.broker.call("importstate.startSession", {
      				sessionId,
      				type: "watcher",
      			});
      			
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
              const result: any = await this.broker.call("library.rawImportToDB", {
              	importType: "new",
              	payload: payload,
              });
              
              this.logger.info(`Successfully imported: ${filePath}`);
              
              // Complete watcher session
              await this.broker.call("importstate.completeSession", {
              	sessionId,
              	success: result.success,
              });
             } else {
              // Complete session even if no folder data
              await this.broker.call("importstate.completeSession", {
              	sessionId,
              	success: false,
              });
             }
            }
           } catch (error) {
            this.logger.error(`Error importing file ${filePath}:`, error);
            // Try to complete session on error
            try {
             const sessionId = `watcher-${Date.now()}`;
             await this.broker.call("importstate.completeSession", {
              sessionId,
              success: false,
             });
            } catch (e) {
             // Ignore session completion errors
            }
           }
      }, 3000);
    }
    
    // Broadcast file system event
    this.broker.broadcast(event, { path: filePath });
  }
}
