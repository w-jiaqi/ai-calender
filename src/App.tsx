import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  Github,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  conferences,
  Confidence,
  DeadlineEvent,
  DeadlineKind,
  Domain,
  Conference,
} from "./conferenceData";

type FlatEvent = DeadlineEvent & {
  conference: Conference;
};

const domainOrder: Domain[] = ["ML", "NLP", "Vision", "Bio"];
const kindOrder: DeadlineKind[] = [
  "abstract",
  "paper",
  "supplemental",
  "review",
  "response",
  "commitment",
  "decision",
  "camera",
  "registration",
  "conference",
  "other",
];

const kindLabels: Record<DeadlineKind, string> = {
  abstract: "Abstract",
  paper: "Paper",
  supplemental: "Supplement",
  review: "Review",
  response: "Response",
  commitment: "Commit",
  decision: "Decision",
  camera: "Camera",
  conference: "Conference",
  registration: "Registration",
  other: "Other",
};

const confidenceLabels: Record<Confidence, string> = {
  official: "Official",
  preliminary: "Prelim",
  tbd: "TBD",
  conflict: "Conflict",
};

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date?: string, endDate?: string): string {
  if (!date) return "TBD";
  const start = fullDateFormatter.format(parseDate(date));
  if (!endDate) return start;
  return `${start} - ${fullDateFormatter.format(parseDate(endDate))}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonthDays(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function compareEvents(a: FlatEvent, b: FlatEvent): number {
  if (!a.date && !b.date) return a.conference.acronym.localeCompare(b.conference.acronym);
  if (!a.date) return 1;
  if (!b.date) return -1;
  const delta = parseDate(a.date).getTime() - parseDate(b.date).getTime();
  if (delta !== 0) return delta;
  return kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
}

function daysUntil(date: string, today: Date): number {
  return Math.ceil((parseDate(date).getTime() - today.getTime()) / 86_400_000);
}

function compactDelta(date?: string, today?: Date): string {
  if (!date || !today) return "TBD";
  const days = daysUntil(date, today);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `${days}d`;
  return `${Math.abs(days)}d ago`;
}

function toIcsDate(date: string): string {
  return date.replace(/-/g, "");
}

function makeGoogleCalendarUrl(event: FlatEvent): string {
  if (!event.date) return event.sourceUrl;
  const start = toIcsDate(event.date);
  const end = toIcsDate(dateKey(addDays(parseDate(event.endDate ?? event.date), 1)));
  const details = [
    `${event.conference.name} (${event.conference.acronym} ${event.conference.year})`,
    event.notes,
    `Timezone: ${event.timezone}`,
    `Source: ${event.sourceUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.conference.acronym} ${event.conference.year}: ${event.label}`,
    dates: `${start}/${end}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function makeIcs(events: FlatEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Conference Calendar//Deadlines//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    if (!event.date) continue;
    const start = toIcsDate(event.date);
    const end = toIcsDate(dateKey(addDays(parseDate(event.endDate ?? event.date), 1)));
    const uid = `${event.id}@ai-conference-calendar`;
    const summary = `${event.conference.acronym} ${event.conference.year}: ${event.label}`;
    const description = [
      event.notes,
      `Timezone: ${event.timezone}`,
      `Confidence: ${confidenceLabels[event.confidence]}`,
      `Source: ${event.sourceUrl}`,
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `URL:${event.sourceUrl}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function downloadCalendar(events: FlatEvent[]) {
  const blob = new Blob([makeIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ai-conference-deadlines.ics";
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [query, setQuery] = useState("");
  const [selectedDomains, setSelectedDomains] = useState<Set<Domain>>(
    () => new Set(domainOrder),
  );
  const [selectedKinds, setSelectedKinds] = useState<Set<DeadlineKind>>(
    () => new Set(["abstract", "paper", "response", "decision", "camera", "conference"]),
  );
  const [showPast, setShowPast] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("neurips-2026");

  const allEvents = useMemo<FlatEvent[]>(
    () =>
      conferences
        .flatMap((conference) =>
          conference.events.map((event) => ({
            ...event,
            conference,
          })),
        )
        .sort(compareEvents),
    [],
  );

  const selectedConference =
    conferences.find((conference) => conference.id === selectedId) ?? conferences[0];

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();
    return allEvents.filter((event) => {
      const text = [
        event.conference.acronym,
        event.conference.name,
        event.conference.location,
        event.label,
        event.track,
        event.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const isPast = event.date ? parseDate(event.date) < today : false;
      return (
        selectedDomains.has(event.conference.domain) &&
        selectedKinds.has(event.kind) &&
        (showPast || !isPast) &&
        (!search || text.includes(search))
      );
    });
  }, [allEvents, query, selectedDomains, selectedKinds, showPast, today]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, FlatEvent[]>();
    for (const event of filteredEvents) {
      if (!event.date) continue;
      const key = event.date;
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    for (const events of map.values()) events.sort(compareEvents);
    return map;
  }, [filteredEvents]);

  const upcoming = useMemo(
    () =>
      allEvents
        .filter((event) => event.date && parseDate(event.date) >= today)
        .sort(compareEvents)
        .slice(0, 12),
    [allEvents, today],
  );

  const tbdEvents = allEvents.filter((event) => !event.date);
  const monthDays = getMonthDays(month);
  const datedFilteredEvents = filteredEvents.filter((event) => event.date);
  const nextSubmission = allEvents.find(
    (event) =>
      event.date &&
      parseDate(event.date) >= today &&
      (event.kind === "abstract" || event.kind === "paper"),
  );

  function toggleDomain(domain: Domain) {
    setSelectedDomains((previous) => {
      const next = new Set(previous);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function toggleKind(kind: DeadlineKind) {
    setSelectedKinds((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function moveMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <CalendarDays size={22} />
          </div>
          <div>
            <h1>AI Conference Calendar</h1>
            <p>Last crawl: July 7, 2026</p>
          </div>
        </div>
        <div className="top-actions">
          <a
            className="icon-link"
            href="https://github.com/w-jiaqi/ai-calender"
            title="GitHub repository"
            aria-label="GitHub repository"
          >
            <Github size={18} />
          </a>
          <button
            className="primary-action"
            type="button"
            onClick={() => downloadCalendar(allEvents)}
            title="Download ICS"
          >
            <Download size={17} />
            <span>ICS</span>
          </button>
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Calendar dashboard">
        <aside className="left-panel">
          <div className="metric-strip">
            <div>
              <span>{conferences.length}</span>
              <p>venues</p>
            </div>
            <div>
              <span>{allEvents.filter((event) => event.date).length}</span>
              <p>dated</p>
            </div>
            <div>
              <span>{tbdEvents.length}</span>
              <p>TBD</p>
            </div>
          </div>

          {nextSubmission && (
            <button
              type="button"
              className="next-deadline"
              onClick={() => setSelectedId(nextSubmission.conference.id)}
            >
              <span>Next submission</span>
              <strong>{nextSubmission.conference.acronym}</strong>
              <p>{nextSubmission.label}</p>
              <em>{compactDelta(nextSubmission.date, today)}</em>
            </button>
          )}

          <div className="filter-group">
            <div className="filter-title">
              <Filter size={16} />
              <span>Fields</span>
            </div>
            <div className="toggle-grid two">
              {domainOrder.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  className={`toggle-pill domain-${domain.toLowerCase()} ${
                    selectedDomains.has(domain) ? "active" : ""
                  }`}
                  onClick={() => toggleDomain(domain)}
                >
                  {selectedDomains.has(domain) && <Check size={14} />}
                  <span>{domain}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-title">
              <Filter size={16} />
              <span>Dates</span>
            </div>
            <div className="toggle-grid">
              {kindOrder.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`toggle-pill kind-${kind} ${
                    selectedKinds.has(kind) ? "active" : ""
                  }`}
                  onClick={() => toggleKind(kind)}
                >
                  {selectedKinds.has(kind) && <Check size={14} />}
                  <span>{kindLabels[kind]}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(event) => setShowPast(event.target.checked)}
            />
            <span>Show past dates</span>
          </label>
        </aside>

        <section className="calendar-panel">
          <div className="calendar-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search venues, tracks, dates"
                aria-label="Search venues, tracks, dates"
              />
              {query && (
                <button
                  type="button"
                  title="Clear search"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="month-controls">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                title="Previous month"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="month-label"
                onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              >
                {monthFormatter.format(month)}
              </button>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                title="Next month"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="weekday-row" aria-hidden="true">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="month-grid">
            {monthDays.map((day) => {
              const key = dateKey(day);
              const events = eventsByDay.get(key) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = key === dateKey(today);

              return (
                <div
                  key={key}
                  className={`day-cell ${inMonth ? "" : "muted"} ${isToday ? "today" : ""}`}
                >
                  <div className="day-number">
                    <span>{day.getDate()}</span>
                  </div>
                  <div className="day-events">
                    {events.slice(0, 4).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`event-chip kind-${event.kind} domain-${event.conference.domain.toLowerCase()}`}
                        title={`${event.conference.acronym}: ${event.label}`}
                        onClick={() => setSelectedId(event.conference.id)}
                      >
                        <span>{event.conference.acronym}</span>
                        <em>{kindLabels[event.kind]}</em>
                      </button>
                    ))}
                    {events.length > 4 && <span className="overflow-chip">+{events.length - 4}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="right-panel">
          <section className="agenda-panel">
            <div className="panel-heading">
              <h2>Upcoming</h2>
              <span>{upcoming.length}</span>
            </div>
            <div className="agenda-list">
              {upcoming.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`agenda-item kind-${event.kind}`}
                  onClick={() => setSelectedId(event.conference.id)}
                >
                  <time>{shortMonthFormatter.format(parseDate(event.date as string))}</time>
                  <div>
                    <strong>{event.conference.acronym}</strong>
                    <span>{event.label}</span>
                  </div>
                  <em>{compactDelta(event.date, today)}</em>
                </button>
              ))}
            </div>
          </section>

          <section className="agenda-panel">
            <div className="panel-heading">
              <h2>Unresolved</h2>
              <span>{tbdEvents.length}</span>
            </div>
            <div className="tbd-list">
              {tbdEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedId(event.conference.id)}
                >
                  <strong>{event.conference.acronym}</strong>
                  <span>{event.label}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="details-drawer" aria-label="Conference details">
        <div className="details-heading">
          <div>
            <div className={`domain-badge domain-${selectedConference.domain.toLowerCase()}`}>
              {selectedConference.domain}
            </div>
            <h2>
              {selectedConference.acronym} {selectedConference.year}
            </h2>
            <p>{selectedConference.name}</p>
          </div>
          <a href={selectedConference.sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            <span>Source</span>
          </a>
        </div>

        <div className="detail-meta">
          {selectedConference.location && <span>{selectedConference.location}</span>}
          {selectedConference.venue && <span>{selectedConference.venue}</span>}
          <span>Checked {selectedConference.lastChecked}</span>
        </div>

        {selectedConference.notes && <p className="detail-note">{selectedConference.notes}</p>}

        <div className="timeline">
          {[...selectedConference.events].sort((a, b) => {
            const left = { ...a, conference: selectedConference };
            const right = { ...b, conference: selectedConference };
            return compareEvents(left, right);
          }).map((event) => {
            const flatEvent = { ...event, conference: selectedConference };
            return (
              <article key={event.id} className={`timeline-row kind-${event.kind}`}>
                <div className="timeline-date">
                  <strong>{formatDate(event.date, event.endDate)}</strong>
                  <span>{event.timezone}</span>
                </div>
                <div className="timeline-copy">
                  <div>
                    <h3>{event.label}</h3>
                    {event.track && <span className="track-label">{event.track}</span>}
                  </div>
                  {event.notes && <p>{event.notes}</p>}
                </div>
                <div className="timeline-actions">
                  <span className={`confidence ${event.confidence}`}>
                    {confidenceLabels[event.confidence]}
                  </span>
                  {event.date && (
                    <a
                      href={makeGoogleCalendarUrl(flatEvent)}
                      target="_blank"
                      rel="noreferrer"
                      title="Add to Google Calendar"
                    >
                      <CalendarDays size={16} />
                    </a>
                  )}
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer" title="Open source">
                    <ExternalLink size={16} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="page-footer">
        <span>{datedFilteredEvents.length} matching dated events</span>
        <span>ISMIR excluded; ISMB included.</span>
      </footer>
    </main>
  );
}

export default App;
