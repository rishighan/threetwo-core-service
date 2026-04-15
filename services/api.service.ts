import chokidar, { FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import { Service, ServiceBroker, ServiceSchema, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import debounce from "lodash/debounce";

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
   * Per-path debounced handlers for add/change events, keyed by file path.
   * @private
   */
  private debouncedHandlers: Map<string, ReturnType<typeof debounce>> = new Map();

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
            aliases: {
              "GET /settings/getDirectoryStatus": "settings.getDirectoryStatus",
            },
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

    // Chokidar uses the best native watcher per platform:
    // - macOS: FSEvents
    // - Linux: inotify
    // - Windows: ReadDirectoryChangesW
    // Only use polling when explicitly requested (Docker, network mounts, etc.)
    const forcePolling = process.env.USE_POLLING === "true";
    const platform = process.platform;
    const watchMode = forcePolling ? "polling" : `native (${platform})`;
    
    this.fileWatcher = chokidar.watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: true,
      depth: 10,
      // Use native file watchers by default (FSEvents/inotify/ReadDirectoryChangesW)
      // Fall back to polling only when explicitly requested via USE_POLLING=true
      usePolling: forcePolling,
      interval: forcePolling ? 1000 : undefined,
      binaryInterval: forcePolling ? 1000 : undefined,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      ignored: (p) => p.endsWith(".dctmp") || p.includes("/.git/"),
    });
    
    this.logger.info(`[Watcher] Platform: ${platform}, Mode: ${watchMode}`);

    /**
     * Returns a debounced handler for a specific path, creating one if needed.
     * Debouncing per-path prevents duplicate events for the same file while
     * ensuring each distinct path is always processed.
     */
    const getDebouncedForPath = (p: string) => {
      if (!this.debouncedHandlers.has(p)) {
        const fn = debounce(
          (event: string, filePath: string, stats?: fs.Stats) => {
            this.debouncedHandlers.delete(filePath);
            try {
              this.handleFileEvent(event, filePath, stats);
            } catch (err) {
              this.logger.error(`Error handling file event [${event}] for ${filePath}:`, err);
            }
          },
          200,
          { leading: true, trailing: true }
        );
        this.debouncedHandlers.set(p, fn);
      }
      return this.debouncedHandlers.get(p)!;
    };

    this.fileWatcher
      .on("ready", () => this.logger.info("Initial scan complete."))
      .on("error", (err) => this.logger.error("Watcher error:", err))
      .on("add", (p, stats) => getDebouncedForPath(p)("add", p, stats))
      .on("change", (p, stats) => getDebouncedForPath(p)("change", p, stats))
      // unlink/unlinkDir fire once per path — handle immediately, no debounce needed
      .on("unlink", (p) => this.handleFileEvent("unlink", p))
      .on("addDir", (p) => getDebouncedForPath(p)("addDir", p))
      .on("unlinkDir", (p) => this.handleFileEvent("unlinkDir", p));
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
   const ext = path.extname(filePath).toLowerCase();
   const isComicFile = [".cbz", ".cbr", ".cb7"].includes(ext);
   
   this.logger.info(`[Watcher] File event [${event}]: ${filePath} (ext: ${ext}, isComic: ${isComicFile})`);
   
   // Handle file/directory removal — mark affected comics as missing and notify frontend
   if (event === "unlink" || event === "unlinkDir") {
      // For unlink events, process if it's a comic file OR a directory (unlinkDir)
      if (event === "unlinkDir" || isComicFile) {
         this.logger.info(`[Watcher] Processing deletion for: ${filePath}`);
         try {
            const result: any = await this.broker.call("library.markFileAsMissing", { filePath });
            this.logger.info(`[Watcher] markFileAsMissing result: marked=${result.marked}, path=${filePath}`);
            if (result.marked > 0) {
               await this.broker.call("socket.broadcast", {
                  namespace: "/",
                  event: "LS_FILES_MISSING",
                  args: [{
                     missingComics: result.missingComics,
                     triggerPath: filePath,
                     count: result.marked,
                  }],
               });
               this.logger.info(`[Watcher] Marked ${result.marked} comic(s) as missing for path: ${filePath}`);
            } else {
               this.logger.info(`[Watcher] No matching comics found in DB for deleted path: ${filePath}`);
            }
         } catch (err) {
            this.logger.error(`[Watcher] Failed to mark comics missing for ${filePath}:`, err);
         }
      } else {
         this.logger.info(`[Watcher] Ignoring non-comic file deletion: ${filePath}`);
      }
      return;
   }

   if (event === "add" && stats) {
      setTimeout(async () => {
        try {
          const newStats = await fs.promises.stat(filePath);
          if (newStats.mtime.getTime() === stats.mtime.getTime()) {
            this.logger.info(`[Watcher] Stable file detected: ${filePath}`);

            // Clear missing flag if this file was previously marked absent
            await this.broker.call("library.clearFileMissingFlag", { filePath });

            await this.broker.call("socket.broadcast", {
              namespace: "/",
              event: "LS_FILE_DETECTED",
              args: [{
                filePath,
                fileSize: newStats.size,
                extension: path.extname(filePath),
              }],
            });
          }
        } catch (error) {
          this.logger.error(`[Watcher] Error handling detected file ${filePath}:`, error);
        }
      }, 3000);
    }
  }
}
