import winston, { level } from "winston"

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "verbose",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "warn.log", level: "warn" }),
    new winston.transports.File({ filename: "verbose.log", level: "verbose" }),
  ],
})
