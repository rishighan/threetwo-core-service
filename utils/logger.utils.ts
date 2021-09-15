import { default as Pino } from "pino";
import { default as pinopretty } from "pino-pretty";

export const logger = Pino({
  name: "Threetwo!",
  prettyPrint: { colorize: true },
  // crlf: false,
  // errorLikeObjectKeys: ["err", "error"],
  // errorProps: "",
  // levelFirst: false,
  messageKey: "msg", // --messageKey
  levelKey: "level", // --levelKey
  // messageFormat: false, // --messageFormat
  // timestampKey: "time", // --timestampKey
  // translateTime: false, // --translateTime
  // search: "foo == `bar`", // --search
  // ignore: "pid,hostname", // --ignore
  // hideObject: false, // --hideObject
  // singleLine: false,
});
