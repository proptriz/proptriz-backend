import { createLogger, format, transports, Logger } from "winston";
import { env } from "../utils/env";
// import { SentryTransport } from "./sentryConnection";

// define the logging configuration logic
export const getLoggerConfig = (): { level: string; format: any; transports: any[] } => {
  let logLevel: string;
  let logFormat: any;
  const loggerTransports: any[] = [];

  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'sandbox') {
    logLevel = 'info';
    logFormat = format.combine(
      format.colorize(),
      format.simple()
    );
    loggerTransports.push(
      new transports.Console({ format: logFormat })
    );
  } else if (env.NODE_ENV === 'production') {
    logLevel = 'error'; // to be set to 'info' in future for debuging production issues
    logFormat = format.combine(
      format.errors({ stack: true }),
      format.colorize(),
      format.timestamp(),
      format.json()
    );
    // Add at least one transport, e.g. console or file
    loggerTransports.push(
      new transports.Console({ format: logFormat })
    );

    // Optionally enable Sentry transport
    // loggerTransports.push(new SentryTransport({ stream: process.stdout }));
  } else {
    // fallback so Winston always has at least one transport
    logLevel = 'debug';
    logFormat = format.combine(format.colorize(), format.simple());
    loggerTransports.push(
      new transports.Console({ format: logFormat })
    );
  }

  return { level: logLevel, format: logFormat, transports: loggerTransports };
};

// Create the logger using the configuration
const loggerConfig = getLoggerConfig();

const logger: Logger = createLogger({
  level: loggerConfig.level,
  format: loggerConfig.format,
  transports: loggerConfig.transports
});

export default logger;

