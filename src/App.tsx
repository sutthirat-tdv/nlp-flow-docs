import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { SearchPalette } from "./components/SearchPalette";
import { useData } from "./data";
import { CollectionDetailPage, CollectionsPage } from "./pages/Collections";
import { DependencyDetailPage, DependenciesPage } from "./pages/Dependencies";
import { EndpointDetailPage, EndpointsPage } from "./pages/Endpoints";
import { EntitiesPage, EntityDetailPage } from "./pages/Entities";
import { FlowDetailPage, FlowsPage } from "./pages/Flows";
import { GuidePage } from "./pages/Guide";
import { HomePage } from "./pages/Home";
import { JobDetailPage, JobsPage } from "./pages/Jobs";
import { NotFoundPage } from "./pages/NotFound";
import { ReleasesPage } from "./pages/Releases";
import { SchemaDetailPage, SchemasPage } from "./pages/Schemas";
import { ServiceDetailPage, ServicesPage } from "./pages/Services";
import { SystemsPage } from "./pages/Systems";
import { TopicDetailPage, TopicsPage } from "./pages/Topics";
import { UseCaseDetailPage, UseCasesPage } from "./pages/UseCases";

function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { core } = useData();
  const isMac =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const httpEndpointCount = core.endpoints.filter((e) => e.method !== "CRON")
    .length;
  const batchJobCount = core.endpoints.filter((e) => e.method === "CRON")
    .length;

  const link = (to: string, label: string, count?: number) => (
    <NavLink key={to} to={to} className="sidebar__link" end={to === "/"}>
      <span>{label}</span>
      {count !== undefined ? (
        <span className="sidebar__count">{count.toLocaleString()}</span>
      ) : null}
    </NavLink>
  );

  return (
    <nav className="sidebar">
      <Link to="/" className="sidebar__brand">
        NLP Loyalty Platform
      </Link>
      <div className="sidebar__tagline">
        Flows, use cases and data schemas · branch sit
      </div>

      <button className="sidebar__search" onClick={onSearch}>
        <span>Search everything…</span>
        <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>

      <div className="sidebar__group">
        <div className="sidebar__label">Start here</div>
        {link("/", "Overview")}
        {link("/guide", "New joiner guide")}
        {link("/services", "Services", core.stats.repos)}
      </div>

      <div className="sidebar__group">
        <div className="sidebar__label">Behaviour</div>
        {link("/flows", "End-to-end flows", core.stats.flows)}
        {link("/endpoints", "API endpoints", httpEndpointCount)}
        {link("/jobs", "Batch jobs", batchJobCount)}
        {link("/topics", "Kafka topics", core.stats.topics)}
        {link("/use-cases", "Use cases", core.stats.useCases)}
      </div>

      <div className="sidebar__group">
        <div className="sidebar__label">Data</div>
        {link("/entities", "Business entities")}
        {link("/schemas", "Data schemas", core.stats.schemas)}
        {link("/database", "Mongo collections", core.stats.collections)}
        {link("/dependencies", "HTTP dependencies", core.stats.httpClients)}
        {link("/systems", "Downstream systems", core.systems.length)}
      </div>

      <div className="sidebar__group">
        <div className="sidebar__label">Provenance</div>
        {link("/releases", "Versions & updates")}
      </div>
    </nav>
  );
}

export function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (
        event.key === "/" &&
        !/input|textarea/i.test((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="layout">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <main className="main">
        <div className="main__inner">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/services/:repoId" element={<ServiceDetailPage />} />
            <Route path="/flows" element={<FlowsPage />} />
            <Route path="/flows/:flowId" element={<FlowDetailPage />} />
            <Route path="/endpoints" element={<EndpointsPage />} />
            <Route
              path="/endpoints/:endpointId"
              element={<EndpointDetailPage />}
            />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
            <Route path="/topics" element={<TopicsPage />} />
            <Route path="/topics/:topicName" element={<TopicDetailPage />} />
            <Route path="/use-cases" element={<UseCasesPage />} />
            <Route
              path="/use-cases/:useCaseId"
              element={<UseCaseDetailPage />}
            />
            <Route path="/schemas" element={<SchemasPage />} />
            <Route path="/schemas/:schemaId" element={<SchemaDetailPage />} />
            <Route path="/entities" element={<EntitiesPage />} />
            <Route path="/entities/:entityId" element={<EntityDetailPage />} />
            <Route path="/database" element={<CollectionsPage />} />
            <Route
              path="/database/:collectionId"
              element={<CollectionDetailPage />}
            />
            <Route path="/dependencies" element={<DependenciesPage />} />
            <Route
              path="/dependencies/:clientId"
              element={<DependencyDetailPage />}
            />
            <Route path="/systems" element={<SystemsPage />} />
            <Route path="/releases" element={<ReleasesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Footer />
        </div>
      </main>
      {paletteOpen ? (
        <SearchPalette onClose={() => setPaletteOpen(false)} />
      ) : null}
    </div>
  );
}

function Footer() {
  const { core } = useData();
  return (
    <div className="footer-note">
      <span>
        Generated from source on {new Date(core.generatedAt).toLocaleString()} ·
        nothing here is hand maintained
      </span>
      <Link to="/releases">See which commits this reflects →</Link>
    </div>
  );
}
