import "reflect-metadata";
import { runtimeContextStore } from "@knowget/context";
import { SECURITY_HEADERS } from "@knowget/security";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadAppConfig } from "./platform/config/app-config";
import { createCorrelationMiddleware } from "./platform/context/correlation.middleware";

/** Bootstrap the KnowGET MHaiTI API on the Platform Runtime Kernel. */
async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  const app = await NestFactory.create(AppModule, { cors: true });

  // Graceful shutdown drives the kernel's shutdown hooks (OnApplicationShutdown).
  app.enableShutdownHooks();

  // Establish a correlation context for every request (before all handlers).
  app.use(createCorrelationMiddleware(runtimeContextStore));

  // Baseline security headers (foundation; hardened in P1-M04).
  app.use(
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(header, value);
      }
      next();
    },
  );

  await app.listen(config.API_PORT, config.API_HOST);
  Logger.log(
    `KnowGET MHaiTI API listening on http://${config.API_HOST}:${config.API_PORT}`,
    "Bootstrap",
  );
}

void bootstrap();
