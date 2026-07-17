import "reflect-metadata";
import { SECURITY_HEADERS } from "@knowget/security";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/** Bootstrap the KnowGET MHaiTI API. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Apply baseline security headers (foundation; hardened in P1-M04).
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

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
  Logger.log(`KnowGET MHaiTI API listening on http://${host}:${port}`, "Bootstrap");
}

void bootstrap();
