import type { Cache } from "@knowget/cache";
import { DocumentBuilder, HtmlRenderer } from "@knowget/documents";
import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../security/decorators";
import type { SearchService } from "./backends/search-service";
import { CACHE, SEARCH_INDEX } from "./services.tokens";

interface ServiceDescriptor {
  readonly name: string;
  readonly capability: string;
  readonly defaultImplementation: string;
}

const CATALOG: readonly ServiceDescriptor[] = [
  { name: "cache", capability: "Caching (TTL/LRU)", defaultImplementation: "in-memory" },
  { name: "jobs", capability: "Background jobs & scheduling", defaultImplementation: "in-memory" },
  { name: "files", capability: "Blob storage", defaultImplementation: "in-memory / node-fs" },
  { name: "search", capability: "Full-text search", defaultImplementation: "in-memory index" },
  { name: "i18n", capability: "Localization", defaultImplementation: "in-memory catalogs" },
  {
    name: "notifications",
    capability: "Notifications",
    defaultImplementation: "in-app / recording",
  },
  { name: "documents", capability: "Document generation", defaultImplementation: "html/md/text" },
  { name: "media", capability: "Media assets & renditions", defaultImplementation: "passthrough" },
  { name: "events", capability: "Transactional outbox", defaultImplementation: "in-memory" },
];

/**
 * Read-only visibility into the shared-services layer: the capability catalog
 * and a live self-test that round-trips a couple of the wired singletons to
 * prove the platform is assembled and healthy.
 */
@Public()
@Controller("services")
export class ServicesController {
  constructor(
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(SEARCH_INDEX) private readonly search: SearchService,
  ) {}

  @Get()
  catalog(): { services: readonly ServiceDescriptor[] } {
    return { services: CATALOG };
  }

  @Get("selftest")
  async selftest(): Promise<{
    cache: string;
    search: number;
    documentPreview: string;
  }> {
    const key = "__selftest__";
    await this.cache.set(key, "ok", { ttlMs: 1000 });
    const cached = (await this.cache.get<string>(key)) ?? "miss";

    await this.search.index({ id: key, text: "shared services self test" });
    const hits = (await this.search.search({ text: "self test" })).total;
    await this.search.remove(key);

    const html = new HtmlRenderer().render(
      new DocumentBuilder().heading(2, "Self-test").paragraph("ok").build(),
    );

    return { cache: cached, search: hits, documentPreview: html.slice(0, 40) };
  }
}
