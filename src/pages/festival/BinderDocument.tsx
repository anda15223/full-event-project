import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import "@/lib/pdfFonts";
import type { BinderData, SectionKey } from "@/lib/binder";
import { BINDER_SECTIONS } from "@/lib/binder";
import { sortedCategories, categoryLabel, regroupForSoborgPDF } from "@/lib/soborgLoading";
import { formatDateRange } from "@/lib/dateFormat";
import { normalizeForPdf } from "@/lib/textNormalize";


try {
  // Open Sans via fontsource (jsdelivr) — reliable WOFF URLs, full Latin + Latin-Extended coverage
  Font.register({
    family: "OpenSans",
    fonts: [
      { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-400-normal.woff", fontWeight: 400 },
      { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-700-normal.woff", fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
} catch {}

const N = normalizeForPdf;

const RED = "#e11d48";       // rose-600
const GREEN = "#059669";     // emerald-600
const AMBER = "#d97706";     // amber-600
const GRAY = "#6b7280";      // zinc-500
const MUTED = "#9ca3af";     // zinc-400
const LIGHT = "#e5e7eb";     // zinc-200
const DARK = "#111827";      // zinc-900

// Section accent palette (per Sprint 7 spec)
const ACCENT = {
  blue:    { fg: "#2563eb", bg: "rgba(37, 99, 235, 0.12)" },
  rose:    { fg: "#e11d48", bg: "rgba(225, 29, 72, 0.12)" },
  slate:   { fg: "#475569", bg: "rgba(71, 85, 105, 0.12)" },
  emerald: { fg: "#059669", bg: "rgba(5, 150, 105, 0.12)" },
  violet:  { fg: "#7c3aed", bg: "rgba(124, 58, 237, 0.12)" },
  amber:   { fg: "#d97706", bg: "rgba(217, 119, 6, 0.12)" },
} as const;

type AccentKey = keyof typeof ACCENT;

// Map title → { number, accent, subtitle }
const SECTION_META: Record<string, { num: number; accent: AccentKey; subtitle: string }> = {
  "Festival Overview":        { num: 1,  accent: "blue",    subtitle: "Snapshot of countdown, concepts, and primary contacts" },
  "Action Items":             { num: 2,  accent: "rose",    subtitle: "Open and in-progress tasks, sorted by priority then due date" },
  "Key Contacts":             { num: 3,  accent: "slate",   subtitle: "Festival, concept team, and supplier contacts" },
  "Setup Timeline":           { num: 4,  accent: "emerald", subtitle: "Setup-through-teardown event schedule" },
  "Contracts":                { num: 5,  accent: "violet",  subtitle: "Per-concept contracts, signed status, and obligations" },
  "Transport":                { num: 6,  accent: "blue",    subtitle: "Vehicles, accreditation, and movement legs" },
  "Topskilt":                 { num: 7,  accent: "violet",  subtitle: "Top-sign design and print status per concept" },
  "Facade":                   { num: 8,  accent: "rose",    subtitle: "Facade design, material, and approval status per concept" },
  "Power":                    { num: 9,  accent: "amber",   subtitle: "Per-concept power demand, equipment, and connection allocation" },
  "Cooling":                  { num: 10, accent: "blue",    subtitle: "Refrigerated units, delivery windows, and concept assignments" },
  "Safety":                   { num: 11, accent: "slate",   subtitle: "Gas, food, electrical, fire, and evacuation status" },
  "Accommodation":            { num: 12, accent: "blue",    subtitle: "Crew bookings, dates, and night counts" },
  "Søborg Loading Manifest":  { num: 13, accent: "violet",  subtitle: "Items loaded from the Søborg warehouse, grouped by category" },
  "Soborg Loading Manifest":  { num: 13, accent: "violet",  subtitle: "Items loaded from the Søborg warehouse, grouped by category" },
  "Open Questions":           { num: 14, accent: "slate",   subtitle: "Unresolved questions, sorted by urgency" },
  "Active Rules":             { num: 15, accent: "amber",   subtitle: "Critical and important business rules in effect" },
  "Contents":                 { num: 0,  accent: "slate",   subtitle: "" },
};

const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 56, paddingHorizontal: 36, fontFamily: "Inter", fontSize: 11, lineHeight: 1.5, color: DARK },
  // Cover
  coverPage: { padding: 60, fontFamily: "Inter", color: DARK, justifyContent: "center", alignItems: "center" },
  coverTitle: { fontSize: 38, fontWeight: 700, textAlign: "center", letterSpacing: -0.5 },
  coverSub: { fontSize: 18, marginTop: 20, textAlign: "center", color: GRAY, fontWeight: 400 },
  coverDates: { fontSize: 14, marginTop: 16, color: GRAY, textAlign: "center" },
  coverFooter: { position: "absolute", bottom: 50, left: 60, right: 60, textAlign: "center", color: MUTED, fontSize: 9 },
  // Section header (numbered circle + title + subtitle + divider)
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sectionCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  sectionCircleNum: { fontSize: 13, fontWeight: 700 },
  sectionTitle: { fontSize: 22, fontWeight: 700, letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 10, color: GRAY, marginBottom: 10, marginLeft: 40 },
  sectionDivider: { borderBottom: `0.5pt solid ${LIGHT}`, marginBottom: 16 },
  // Footer (3-col, "/" separators)
  footer: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    flexDirection: "row", borderTop: `0.5pt solid ${LIGHT}`, paddingTop: 6,
    fontSize: 8, color: MUTED,
  },
  footerLeft: { flex: 1, textAlign: "left" },
  footerCenter: { flex: 1, textAlign: "center" },
  footerRight: { flex: 1, textAlign: "right" },
  // Table
  th: { flexDirection: "row", borderBottom: `0.5pt solid ${DARK}`, paddingBottom: 4, marginBottom: 4, fontWeight: 700, fontSize: 9 },
  tr: { flexDirection: "row", borderBottom: `0.25pt solid ${LIGHT}`, paddingVertical: 4, fontSize: 9 },
  // Misc
  small: { fontSize: 9.5, lineHeight: 1.45 },
  warn: { color: RED },
  ok: { color: GREEN },
  amber: { color: AMBER },
  bold: { fontWeight: 700 },
  para: { marginBottom: 5 },
  // ToC
  tocRow: { flexDirection: "row", paddingVertical: 5, alignItems: "baseline" },
  tocNum: { width: 22, fontSize: 11, fontWeight: 600, color: GRAY },
  tocLabel: { fontSize: 12 },
  tocLeader: { flex: 1, marginHorizontal: 6, borderBottom: `0.5pt dotted ${LIGHT}`, alignSelf: "center", height: 1 },
  tocPage: { fontSize: 11, color: GRAY, fontWeight: 600, minWidth: 24, textAlign: "right" },
});

const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const fmtFull = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtCoverDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function SectionFooter({ name, festival }: { name: string; festival: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerLeft}>{N(festival)}</Text>
      <Text style={s.footerCenter}>{N(name)}</Text>
      <Text style={s.footerRight} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  const cleanTitle = title.replace(/^Soborg/, "Søborg");
  const m = SECTION_META[cleanTitle] ?? SECTION_META[title] ?? { num: 0, accent: "slate" as AccentKey, subtitle: "" };
  const accent = ACCENT[m.accent];
  const subtitle = meta || m.subtitle;
  return (
    <View>
      <View style={s.sectionHeaderRow}>
        {m.num > 0 && (
          <View style={[s.sectionCircle, { backgroundColor: accent.bg }]}>
            <Text style={[s.sectionCircleNum, { color: accent.fg }]}>{m.num}</Text>
          </View>
        )}
        <Text style={s.sectionTitle}>{cleanTitle}</Text>
      </View>
      {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={s.sectionDivider} />
    </View>
  );
}

// ============ SECTION RENDERERS ============

function CoverPage({ data }: { data: BinderData }) {
  const { festival, generatedAt } = data;
  const STRIP_LEAD = (s: string) => s.replace(/^[^A-Za-z0-9ÆØÅæøå]+/, "");
  const titleString = STRIP_LEAD(N(festival.name));
  const dateString = STRIP_LEAD(N(formatDateRange(festival.start_date, festival.end_date)));
  const f: any = festival;
  const addressParts = [f.address, f.city, f.country].filter(Boolean).map((p: any) => N(String(p)));
  const addressLine = addressParts.length ? addressParts.join(", ") : "";
  const genStr = `Generated by Full Event Project · ${fmtCoverDate(new Date(generatedAt))}`;
  return (
    <Page size="A4" style={s.coverPage}>
      <Text style={s.coverTitle}>{titleString}</Text>
      <Text style={s.coverSub}>Operations Binder</Text>
      <Text style={[s.coverDates, { marginTop: 32, fontSize: 18, color: DARK, fontWeight: 500 }]}>{dateString}</Text>
      {addressLine ? <Text style={[s.coverDates, { fontSize: 14, marginTop: 12 }]}>{addressLine}</Text> : null}
      <Text style={s.coverFooter}>{N(genStr)}</Text>
    </Page>
  );
}

function ToCPage({ sections, festival }: { sections: { key: SectionKey; label: string; page: number }[]; festival: string }) {
  return (
    <Page size="A4" style={s.page} bookmark="Contents">
      <SectionHeader title="Contents" meta="Section index for the operations binder" />
      {sections.map((sec) => {
        const cleanLabel = sec.label.replace(/^Soborg/, "Søborg");
        const meta = SECTION_META[cleanLabel] ?? { num: 0 };
        return (
          <View key={sec.key} style={s.tocRow}>
            <Text style={s.tocNum}>{meta.num > 0 ? `${meta.num}.` : ""}</Text>
            <Text style={s.tocLabel}>{cleanLabel}</Text>
            <View style={s.tocLeader} />
            <Text style={s.tocPage}>{sec.page}</Text>
          </View>
        );
      })}
      <SectionFooter name="Contents" festival={festival} />
    </Page>
  );
}

function OverviewPage({ data }: { data: BinderData }) {
  const { festival, criticalCount, overdueCount, primaryContacts, contracts, concepts } = data;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startD = new Date(festival.start_date);
  const days = Math.round((startD.getTime() - today.getTime()) / 86400000);
  return (
    <Page size="A4" style={s.page} bookmark="Festival Overview">
      <SectionHeader title="Festival Overview" meta={`${festival.name} · ${formatDateRange(festival.start_date, festival.end_date)}`} />

      <View style={{ marginBottom: 8 }}>
        <Text style={[s.bold, { fontSize: 14 }]}>
          {days >= 0 ? `T-${days} days to start` : `Started ${-days} days ago`}
          {"  ·  "}
          <Text style={criticalCount > 0 ? s.warn : {}}>{criticalCount} critical items</Text>
          {"  ·  "}
          <Text style={overdueCount > 0 ? s.warn : {}}>{overdueCount} overdue</Text>
        </Text>
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text style={[s.bold, s.small, { marginBottom: 4 }]}>CONCEPTS ({concepts.length})</Text>
        {concepts.map((c: any) => {
          const k = contracts.find((x: any) => x.concept_id === c.id);
          return (
            <Text key={c.id} style={s.small}>
              • {c.name} — contract: <Text style={k?.contract_status === "signed" ? s.ok : s.warn}>{k?.contract_status ?? "missing"}</Text>
              {k?.inspection_date ? `  ·  inspection ${fmt(k.inspection_date)}` : ""}
            </Text>
          );
        })}
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text style={[s.bold, s.small, { marginBottom: 4 }]}>PRIMARY CONTACTS</Text>
        {primaryContacts.length === 0 && <Text style={[s.small, { color: GRAY }]}>None marked primary.</Text>}
        {primaryContacts.slice(0, 8).map((c: any) => (
          <View key={c.id} style={{ marginBottom: 3 }}>
            <Text style={s.small}>{N(c.role)}: <Text style={s.bold}>{N(c.full_name)}</Text>{c.organization ? `  (${N(c.organization)})` : ""}</Text>
            <Text style={[s.small, { color: GRAY }]}>Email: {N(c.email) || "\u2014"}    Phone: {N(c.phone) || "\u2014"}</Text>
          </View>
        ))}
      </View>

      <SectionFooter name="Overview" festival={festival.name} />
    </Page>
  );
}

function ActionsPage({ data }: { data: BinderData }) {
  const { festival, actionItems, concepts } = data;
  const conceptName = (id?: string | null) => concepts.find((c: any) => c.id === id)?.name ?? "—";
  const open = actionItems
    .filter((a) => a.status === "open" || a.status === "in_progress")
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Page size="A4" style={s.page} bookmark="Action Items" wrap>
      <SectionHeader title="Action Items" meta={`${open.length} open or in progress · sorted by priority then due date`} />
      <View style={s.th}>
        <Text style={{ width: 40 }}>Pri</Text>
        <Text style={{ width: 50 }}>Status</Text>
        <Text style={{ width: 55 }}>Due</Text>
        <Text style={{ flex: 1 }}>Title</Text>
        <Text style={{ width: 70 }}>Concept</Text>
        <Text style={{ width: 70 }}>Owner</Text>
      </View>
      {open.length === 0 && <Text style={[s.small, { color: GRAY, marginTop: 6 }]}>No open action items.</Text>}
      {open.map((a) => {
        const overdue = a.due_date && a.due_date < today;
        return (
          <View key={a.id} style={s.tr} wrap={false}>
            <Text style={[{ width: 40 }, a.priority === "critical" ? s.warn : a.priority === "high" ? s.amber : {}]}>{a.priority}</Text>
            <Text style={{ width: 50 }}>{a.status}</Text>
            <Text style={[{ width: 55 }, overdue ? s.warn : {}]}>{fmt(a.due_date)}</Text>
            <Text style={{ flex: 1 }}>{a.title}</Text>
            <Text style={{ width: 70 }}>{conceptName(a.concept_id)}</Text>
            <Text style={{ width: 70 }}>{a.owner ?? "—"}</Text>
          </View>
        );
      })}
      <SectionFooter name="Action Items" festival={festival.name} />
    </Page>
  );
}

function ContactsPage({ data }: { data: BinderData }) {
  const { festival, contacts } = data;
  return (
    <Page size="A4" style={s.page} bookmark="Key Contacts" wrap>
      <SectionHeader title="Key Contacts" meta={`${contacts.length} total · primary marked ★`} />
      <View style={s.th}>
        <Text style={{ width: 12 }}> </Text>
        <Text style={{ flex: 1 }}>Name</Text>
        <Text style={{ width: 80 }}>Role</Text>
        <Text style={{ width: 90 }}>Org</Text>
        <Text style={{ width: 110 }}>Email</Text>
        <Text style={{ width: 70 }}>Phone</Text>
      </View>
      {contacts.map((c: any) => (
        <View key={c.id} style={s.tr} wrap={false}>
          <Text style={{ width: 12 }}>{c.is_primary ? "\u2605" : ""}</Text>
          <Text style={{ flex: 1 }}>{N(c.full_name)}</Text>
          <Text style={{ width: 80 }}>{N(c.role) || "\u2014"}</Text>
          <Text style={{ width: 90 }}>{N(c.organization) || "\u2014"}</Text>
          <Text style={{ width: 110 }}>{N(c.email) || "\u2014"}</Text>
          <Text style={{ width: 70 }}>{N(c.phone) || "\u2014"}</Text>
        </View>
      ))}
      <SectionFooter name="Contacts" festival={festival.name} />
    </Page>
  );
}

function TimelinePage({ data }: { data: BinderData }) {
  const { festival, timelineEvents } = data;
  return (
    <Page size="A4" style={s.page} bookmark="Setup Timeline" wrap>
      <SectionHeader title="Setup Timeline" meta={`${timelineEvents.length} events`} />
      <View style={s.th}>
        <Text style={{ width: 60 }}>Date</Text>
        <Text style={{ width: 40 }}>Time</Text>
        <Text style={{ flex: 1 }}>Event</Text>
        <Text style={{ width: 80 }}>Owner</Text>
        <Text style={{ width: 50 }}>Status</Text>
      </View>
      {timelineEvents.length === 0 && <Text style={[s.small, { color: GRAY, marginTop: 6 }]}>No events scheduled.</Text>}
      {timelineEvents.map((e: any) => (
        <View key={e.id} style={s.tr} wrap={false}>
          <Text style={{ width: 60 }}>{fmt(e.event_date)}</Text>
          <Text style={{ width: 40 }}>{e.event_time ? String(e.event_time).slice(0, 5) : "—"}</Text>
          <Text style={{ flex: 1 }}>{e.title}{e.location ? ` — ${e.location}` : ""}</Text>
          <Text style={{ width: 80 }}>{e.responsible_party ?? "—"}</Text>
          <Text style={{ width: 50 }}>{e.status}</Text>
        </View>
      ))}
      <SectionFooter name="Timeline" festival={festival.name} />
    </Page>
  );
}

function ContractsPage({ data }: { data: BinderData }) {
  const { festival, contracts, concepts } = data;
  const conceptName = (id?: string | null) => concepts.find((c: any) => c.id === id)?.name ?? "—";
  return (
    <Page size="A4" style={s.page} bookmark="Contracts" wrap>
      <SectionHeader title="Contracts" meta={`${contracts.length} contracts`} />
      {contracts.length === 0 && <Text style={[s.small, { color: GRAY }]}>No contracts.</Text>}
      {contracts.map((k: any) => (
        <View key={k.id} style={{ marginBottom: 8, paddingBottom: 6, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
          <Text style={[s.bold, s.small]}>{conceptName(k.concept_id)}{k.concept_alias ? ` (${k.concept_alias})` : ""}</Text>
          <Text style={s.small}>
            Status: <Text style={k.contract_status === "signed" ? s.ok : s.warn}>{k.contract_status ?? "—"}</Text>
            {k.contract_signed_date ? `   ·   Signed ${fmt(k.contract_signed_date)}` : ""}
            {k.signing_platform ? `   ·   ${k.signing_platform}` : ""}
          </Text>
          {k.contract_value_dkk ? (
            <Text style={s.small}>Value: {Number(k.contract_value_dkk).toLocaleString()} DKK{k.contract_signed_by ? `   ·   Signed by ${k.contract_signed_by}` : ""}</Text>
          ) : (k.contract_signed_by ? <Text style={s.small}>Signed by {k.contract_signed_by}</Text> : null)}
          {k.key_obligations && <Text style={[s.small, { color: GRAY, marginTop: 2 }]}>Obligations: {k.key_obligations}</Text>}
        </View>
      ))}
      <SectionFooter name="Contracts" festival={festival.name} />
    </Page>
  );
}

function TransportPage({ data }: { data: BinderData }) {
  const { festival, transport, transportLegs } = data;
  const vMap = new Map(transport.map((v: any) => [v.id, v]));
  return (
    <Page size="A4" style={s.page} bookmark="Transport" wrap>
      <SectionHeader title="Transport" meta={`${transport.length} vehicles \u00b7 ${transportLegs.length} legs`} />
      <Text style={[s.bold, s.small, { marginTop: 4, marginBottom: 4 }]}>VEHICLES</Text>
      <View style={s.th}>
        <Text style={{ flex: 1 }}>Type</Text>
        <Text style={{ width: 80 }}>Plate</Text>
        <Text style={{ width: 50 }}>Capacity</Text>
        <Text style={{ width: 60 }}>Status</Text>
        <Text style={{ width: 70 }}>Accred.</Text>
      </View>
      {transport.map((v: any) => {
        const name = v.season_rental?.vehicle_type ?? v.vehicle_type;
        const plate = v.season_rental?.license_plate ?? v.license_plate;
        const capacity = v.season_rental?.capacity ?? v.capacity;
        const accredPath = v.season_rental?.accreditation_pdf_path ?? v.accreditation_pdf_path;
        return (
          <View key={v.id} style={s.tr} wrap={false}>
            <Text style={{ flex: 1 }}>{N(name)}</Text>
            <Text style={[{ width: 80 }, plate ? null : s.warn]}>{plate ? N(plate) : "pending"}</Text>
            <Text style={{ width: 50 }}>{capacity ?? "\u2014"}</Text>
            <Text style={{ width: 60 }}>{v.status ?? "\u2014"}</Text>
            <Text style={[{ width: 70 }, accredPath ? s.ok : s.warn]}>{accredPath ? "uploaded" : "missing"}</Text>
          </View>
        );
      })}

      <Text style={[s.bold, s.small, { marginTop: 10, marginBottom: 4 }]}>LEGS</Text>
      <View style={s.th}>
        <Text style={{ width: 50 }}>Date</Text>
        <Text style={{ width: 40 }}>Time</Text>
        <Text style={{ flex: 1 }}>From / To</Text>
        <Text style={{ width: 110 }}>Vehicle</Text>
        <Text style={{ width: 50 }}>Status</Text>
      </View>
      {transportLegs.length === 0 && <Text style={[s.small, { color: GRAY, marginTop: 4 }]}>No legs scheduled.</Text>}
      {transportLegs.map((l: any) => {
        const veh: any = vMap.get(l.transport_id) ?? {};
        const vName = veh.season_rental?.vehicle_type ?? veh.vehicle_type;
        const vPlate = veh.season_rental?.license_plate ?? veh.license_plate;
        const from = N(l.origin) || N(veh.pickup_location) || "TBD";
        const to = N(l.destination) || N(veh.return_location) || "Festival site";
        const time = l.leg_start_time ? String(l.leg_start_time).slice(0, 5) : "\u2014";
        return (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={{ width: 50 }}>{fmt(l.leg_date)}</Text>
            <Text style={{ width: 40 }}>{time}</Text>
            <Text style={{ flex: 1 }}>{from}{" to "}{to}{l.leg_label ? `  ·  ${N(l.leg_label)}` : ""}</Text>
            <Text style={{ width: 110 }}>{N(vName) || "\u2014"}{vPlate ? `  ·  ${N(vPlate)}` : ""}</Text>
            <Text style={{ width: 50 }}>{l.status ?? "\u2014"}</Text>
          </View>
        );
      })}
      <SectionFooter name="Transport" festival={festival.name} />
    </Page>
  );
}

function TopskiltPage({ data }: { data: BinderData }) {
  const { festival, topskilt, contracts, concepts } = data;
  const cMap = new Map<string, any>(concepts.map((c: any) => [c.id, c]));
  const kMap = new Map<string, any>(contracts.map((k: any) => [k.id, k]));
  return (
    <Page size="A4" style={s.page} bookmark="Topskilt" wrap>
      <SectionHeader title="Topskilt" meta={`${topskilt.length} entries`} />
      {topskilt.length === 0 && <Text style={[s.small, { color: GRAY }]}>No topskilt records yet.</Text>}
      {topskilt.map((t: any) => {
        const k = kMap.get(t.festival_contract_id) ?? {};
        const c = cMap.get(k.concept_id) ?? {};
        const label = N(k.concept_alias) || N(c.name) || "—";
        return (
          <View key={t.id} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
            <Text style={[s.bold, s.small]}>{label}</Text>
            <Text style={s.small}>
              Design: <Text style={s.bold}>{t.design_status ?? "\u2014"}</Text>
              {t.print_status ? `   \u00b7   Print: ${t.print_status}` : ""}
              {t.print_deadline ? `   \u00b7   Print deadline: ${fmt(t.print_deadline)}` : ""}
            </Text>
            {t.notes && <Text style={[s.small, { color: GRAY }]}>{N(t.notes)}</Text>}
          </View>
        );
      })}
      <SectionFooter name="Topskilt" festival={festival.name} />
    </Page>
  );
}

function FacadePage({ data }: { data: BinderData }) {
  const { festival, facade, contracts, concepts } = data;
  const cMap = new Map(concepts.map((c: any) => [c.id, c.name]));
  const kMap = new Map(contracts.map((k: any) => [k.id, cMap.get(k.concept_id) ?? "—"]));
  return (
    <Page size="A4" style={s.page} bookmark="Facade" wrap>
      <SectionHeader title="Facade" meta={`${facade.length} entries`} />
      {facade.length === 0 && <Text style={[s.small, { color: GRAY }]}>No facade records yet.</Text>}
      {facade.map((f: any) => (
        <View key={f.id} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
          <Text style={[s.bold, s.small]}>{kMap.get(f.festival_contract_id) ?? "—"}</Text>
          <Text style={s.small}>
            Design: {f.design_status ?? "—"}   ·   Material: {f.material_orders_status ?? "—"}
            {f.material_deadline ? `   ·   Material deadline ${fmt(f.material_deadline)}` : ""}
            {f.print_deadline ? `   ·   Print deadline ${fmt(f.print_deadline)}` : ""}
          </Text>
          {f.festival_approval_received_at && <Text style={[s.small, s.ok]}>Festival approved {fmtFull(f.festival_approval_received_at)}</Text>}
          {f.notes && <Text style={[s.small, { color: GRAY }]}>{f.notes}</Text>}
        </View>
      ))}
      <SectionFooter name="Facade" festival={festival.name} />
    </Page>
  );
}

function PowerPage({ data }: { data: BinderData }) {
  const { festival, power, powerEquipment, contracts, concepts } = data;
  const cMap = new Map<string, any>(concepts.map((c: any) => [c.id, c]));
  const kMap = new Map<string, any>(contracts.map((k: any) => [k.id, k]));
  // Group equipment by festival_power_id
  const eqByPower = new Map<string, any[]>();
  (powerEquipment ?? []).forEach((e: any) => {
    const arr = eqByPower.get(e.festival_power_id) ?? [];
    arr.push(e);
    eqByPower.set(e.festival_power_id, arr);
  });

  return (
    <Page size="A4" style={s.page} bookmark="Power" wrap>
      <SectionHeader title="Power" meta={`${power.length} concepts \u00b7 ${powerEquipment.length} equipment items`} />
      {power.length === 0 && <Text style={[s.small, { color: GRAY, marginTop: 4 }]}>No power records.</Text>}
      {power.map((p: any) => {
        const k = kMap.get(p.festival_contract_id) ?? {};
        const c = cMap.get(k.concept_id) ?? {};
        const label = N(k.concept_alias) || N(c.name) || "—";
        const eqs = eqByPower.get(p.id) ?? [];
        const demandKw = eqs.reduce((sum: number, e: any) => sum + (Number(e.power_kw) || 0) * (Number(e.quantity) || 1), 0);
        const allocKw = Number(p.total_kw_estimate) || 0;
        const gap = allocKw - demandKw;
        return (
          <View key={p.id} style={{ marginBottom: 8, paddingBottom: 6, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
            <Text style={[s.bold, s.small]}>{label}{p.tent_location ? `  \u00b7  ${N(p.tent_location)}` : `  \u00b7  ${p.equipment_variant ?? "standalone"}`}</Text>
            <Text style={s.small}>
              Status: <Text style={s.bold}>{p.status ?? "\u2014"}</Text>
              {p.total_kw_estimate ? `   \u00b7   Estimate: ${Number(p.total_kw_estimate).toFixed(1)} kW` : ""}
              {p.total_amp_estimate ? ` (${p.total_amp_estimate} A)` : ""}
              {p.submission_deadline ? `   \u00b7   Deadline: ${fmt(p.submission_deadline)}` : ""}
            </Text>
            <Text style={s.small}>
              {`Connections: 16A/240V ×${p.connections_16a_240v ?? 0}, 16A/400V ×${p.connections_16a_400v ?? 0}, 32A ×${p.connections_32a ?? 0}, 63A ×${p.connections_63a ?? 0}, 125A ×${p.connections_125a ?? 0}`}
            </Text>
            <Text style={[s.small, { marginTop: 2 }]}>Equipment ({eqs.length}):</Text>
            {eqs.length === 0 && <Text style={[s.small, { color: GRAY, marginLeft: 8 }]}>{"— none recorded —"}</Text>}
            {eqs.map((e: any) => (
              <Text key={e.id} style={[s.small, { marginLeft: 8 }]}>
                {`• ${e.quantity ?? 1}× ${N(e.equipment_name)} — ${e.power_type ?? "—"}${e.power_kw ? ` — ${Number(e.power_kw).toFixed(2)} kW` : ""}${e.is_shared ? "  (shared)" : ""}`}
              </Text>
            ))}
            {eqs.length > 0 && (
              <Text style={[s.small, { marginTop: 2 }]}>
                Total demand: <Text style={s.bold}>{demandKw.toFixed(1)} kW</Text>
                {allocKw > 0 ? (
                  <>
                    {"  \u00b7  Allocated: "}<Text style={s.bold}>{allocKw.toFixed(1)} kW</Text>
                    {"  \u00b7  "}
                    <Text style={gap < 0 ? s.warn : gap > 0 ? s.amber : s.ok}>
                      {gap < 0 ? `SHORT ${(-gap).toFixed(1)} kW` : gap > 0 ? `+${gap.toFixed(1)} kW spare` : "match"}
                    </Text>
                  </>
                ) : null}
              </Text>
            )}
            {p.notes && <Text style={[s.small, { color: GRAY }]}>{N(p.notes)}</Text>}
          </View>
        );
      })}
      <SectionFooter name="Power" festival={festival.name} />
    </Page>
  );
}

function CoolingPage({ data }: { data: BinderData }) {
  const { festival, cooling, coolingAssignments, contracts, concepts } = data;
  const cMap = new Map<string, any>(concepts.map((c: any) => [c.id, c]));
  const kMap = new Map<string, any>(contracts.map((k: any) => [k.id, k]));
  return (
    <Page size="A4" style={s.page} bookmark="Cooling" wrap>
      <SectionHeader title="Cooling" meta={`${cooling.length} units`} />
      {cooling.length === 0 && <Text style={[s.small, { color: GRAY }]}>No cooling units.</Text>}
      {cooling.map((u: any) => {
        const assigned = coolingAssignments
          .filter((a: any) => a.cooling_unit_id === u.id)
          .map((a: any) => {
            const k = kMap.get(a.festival_contract_id) ?? {};
            const c = cMap.get(k.concept_id) ?? {};
            return N(k.concept_alias) || N(c.name) || "—";
          });
        return (
          <View key={u.id} style={{ marginBottom: 8, paddingBottom: 6, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
            <Text style={[s.bold, s.small]}>
              {`${N(u.unit_label) || "Unit"} — ${N(u.cooling_model) || "—"}${u.container_type ? `  (${N(u.container_type)})` : ""} — ${N(u.supplier) || "Supplier TBD"}`}
            </Text>
            <Text style={s.small}>
              Delivery: <Text style={s.bold}>{fmt(u.delivery_date)}</Text>
              {"   \u00b7   "}Pickup: <Text style={s.bold}>{fmt(u.pickup_date)}</Text>
              {u.status ? `   \u00b7   Status: ${u.status}` : ""}
              {u.cost_dkk ? `   \u00b7   ${Number(u.cost_dkk).toLocaleString()} DKK` : ""}
            </Text>
            {(u.pallet_count_kol || u.pallet_count_frys) && (
              <Text style={s.small}>{`Pallets — chilled: ${u.pallet_count_kol ?? 0}, frozen: ${u.pallet_count_frys ?? 0}`}</Text>
            )}
            <Text style={s.small}>Assigned to: {assigned.length ? assigned.join(", ") : "\u2014"}</Text>
            {u.notes && <Text style={[s.small, { color: GRAY }]}>{N(u.notes)}</Text>}
          </View>
        );
      })}
      <SectionFooter name="Cooling" festival={festival.name} />
    </Page>
  );
}

function SafetyPage({ data }: { data: BinderData }) {
  const { festival, safety } = data;
  return (
    <Page size="A4" style={s.page} bookmark="Safety">
      <SectionHeader title="Safety" />
      {!safety && <Text style={[s.small, { color: GRAY }]}>No safety record yet.</Text>}
      {safety && (
        <View>
          <Text style={s.para}>Gas safety: <Text style={s.bold}>{safety.gas_safety_status ?? "—"}</Text>{safety.gas_safety_date ? ` (inspection ${fmt(safety.gas_safety_date)})` : ""}</Text>
          <Text style={s.para}>Food authority: <Text style={s.bold}>{safety.food_authority_status ?? "—"}</Text>{safety.food_authority_inspection_date ? ` (${fmt(safety.food_authority_inspection_date)})` : ""}</Text>
          <Text style={s.para}>Electrical certification: <Text style={s.bold}>{safety.electrical_certification_status ?? "—"}</Text></Text>
          <Text style={s.para}>Fire safety: <Text style={s.bold}>{safety.fire_safety_status ?? "—"}</Text></Text>
          <Text style={s.para}>Evacuation plan: <Text style={s.bold}>{safety.evacuation_plan_status ?? "—"}</Text></Text>
          <Text style={s.para}>First aid: <Text style={s.bold}>{safety.first_aid_status ?? "—"}</Text></Text>
          {safety.insurance_status && <Text style={s.para}>Insurance: <Text style={s.bold}>{safety.insurance_status}</Text></Text>}
          {safety.additional_notes && <Text style={[s.small, { color: GRAY, marginTop: 6 }]}>{safety.additional_notes}</Text>}
        </View>
      )}
      <SectionFooter name="Safety" festival={festival.name} />
    </Page>
  );
}

function AccommodationPage({ data }: { data: BinderData }) {
  const { festival, accommodation } = data;
  return (
    <Page size="A4" style={s.page} bookmark="Accommodation" wrap>
      <SectionHeader title="Accommodation" meta={`${accommodation.length} bookings`} />
      {accommodation.length === 0 && <Text style={[s.small, { color: GRAY }]}>No bookings yet.</Text>}
      {accommodation.map((a: any) => (
        <View key={a.id} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
          <Text style={[s.bold, s.small]}>{a.provider_name ?? a.accommodation_type ?? "—"} ({a.accommodation_type ?? "—"})</Text>
          <Text style={s.small}>
            {fmt(a.check_in_date)} to {fmt(a.check_out_date)}
            {a.capacity ? `   ·   ${a.capacity} pax` : ""}
            {a.cost_dkk ? `   ·   ${Number(a.cost_dkk).toLocaleString()} DKK` : ""}
            {a.payment_status ? `   ·   ${a.payment_status}` : ""}
          </Text>
          {a.address && <Text style={s.small}>{a.address}</Text>}
          {(a.contact_name || a.contact_phone || a.contact_email) && (
            <Text style={s.small}>Contact: {a.contact_name ?? "—"} · {a.contact_phone ?? "—"} · {a.contact_email ?? "—"}</Text>
          )}
          {a.confirmation_number && <Text style={[s.small, { color: GRAY }]}>Conf: {a.confirmation_number}</Text>}
          {a.notes && <Text style={[s.small, { color: GRAY }]}>{a.notes}</Text>}
        </View>
      ))}
      <SectionFooter name="Accommodation" festival={festival.name} />
    </Page>
  );
}

function QuestionsPage({ data }: { data: BinderData }) {
  const { festival, questions } = data;
  const sorted = [...questions].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  return (
    <Page size="A4" style={s.page} bookmark="Open Questions" wrap>
      <SectionHeader title="Open Questions" meta={`${sorted.length} open`} />
      {sorted.length === 0 && <Text style={[s.small, { color: GRAY }]}>No open questions.</Text>}
      {sorted.map((q: any) => (
        <View key={q.id} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
          <Text style={[s.bold, s.small, q.priority === "critical" ? s.warn : q.priority === "high" ? s.amber : {}]}>
            [{q.priority}] {N(q.question)}
          </Text>
          {q.context && <Text style={s.small}>{N(q.context)}</Text>}
          <Text style={[s.small, { color: GRAY }]}>
            Owner: {q.decision_owner ?? "—"}
            {q.deadline ? `   ·   Deadline ${fmt(q.deadline)}` : ""}
            {q.blocking_what ? `   ·   Blocking: ${N(q.blocking_what)}` : ""}
          </Text>
        </View>
      ))}
      <SectionFooter name="Questions" festival={festival.name} />
    </Page>
  );
}

function RulesPage({ data }: { data: BinderData }) {
  const { festival, rules } = data;
  const filtered = rules.filter((r: any) => r.level === "critical" || r.level === "important");
  return (
    <Page size="A4" style={s.page} bookmark="Active Rules" wrap>
      <SectionHeader title="Active Rules" meta={`${filtered.length} critical/important rules apply`} />
      {filtered.length === 0 && <Text style={[s.small, { color: GRAY }]}>No active critical or important rules.</Text>}
      {filtered.map((r: any) => (
        <View key={r.id} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: `0.25pt solid ${LIGHT}` }} wrap={false}>
          <Text style={[s.bold, s.small, r.level === "critical" ? s.warn : s.amber]}>
            [{r.level}] {N(r.title)}
          </Text>
          {r.description && <Text style={s.small}>{N(r.description)}</Text>}
          {r.category && <Text style={[s.small, { color: GRAY }]}>Category: {r.category}</Text>}
        </View>
      ))}
      <SectionFooter name="Rules" festival={festival.name} />
    </Page>
  );
}

function SoborgLoadingPage({ data }: { data: BinderData }) {
  const { festival, soborgLoading } = data;
  if (!soborgLoading) {
    return (
      <Page size="A4" style={s.page} bookmark="Søborg Loading Manifest">
        <SectionHeader title="Søborg Loading Manifest" />
        <Text style={[s.small, { color: GRAY }]}>No loading manifest data.</Text>
        <SectionFooter name="Søborg Loading" festival={festival.name} />
      </Page>
    );
  }
  return (
    <Page size="A4" style={s.page} bookmark="Søborg Loading Manifest" wrap>
      <SectionHeader
        title="Søborg Loading Manifest"
        meta={`${soborgLoading.vehicles.length} vehicles · ${soborgLoading.total_items} items loaded from Søborg`}
      />
      {soborgLoading.vehicles.map((veh) => (
        <View key={veh.vehicle_id} style={{ marginBottom: 8 }} wrap={false}>
          <Text style={[s.bold, { fontSize: 11, marginBottom: 3, paddingBottom: 2, borderBottom: `0.5pt solid ${DARK}` }]}>
            {N(veh.vehicle_type)}
            {veh.license_plate
              ? <Text style={{ fontSize: 9, fontWeight: 400 }}>  ·  {N(veh.license_plate)}</Text>
              : <Text style={[s.warn, { fontSize: 9, fontWeight: 400 }]}>  ·  (plate pending)</Text>}
            <Text style={{ fontWeight: 400 }}> — {veh.car_total_items} items</Text>
          </Text>
          {veh.concepts.map((cg) => {
            const grouped = regroupForSoborgPDF(cg.items_by_category);
            return (
            <View key={cg.contract_id} style={{ marginTop: 3, marginBottom: 3 }}>
              <Text style={[s.small, s.bold]}>
                {N(cg.concept_name)}{cg.concept_alias ? ` — ${N(cg.concept_alias)}` : ""}
                <Text style={{ color: GRAY }}>  ({cg.total_items} items)</Text>
              </Text>
              {sortedCategories(grouped).map((cat) => (
                <View key={cat} style={{ marginTop: 1 }}>
                  <Text style={[s.small, { color: GRAY, marginLeft: 6 }]}>{categoryLabel(cat)}:</Text>
                  {grouped[cat].map((it) => {
                    const tags: string[] = [];
                    if (it.power_type) tags.push(it.power_type);
                    if (it.power_kw) tags.push(`${Number(it.power_kw).toFixed(1)} kW`);
                    if (it.is_shared) tags.push("shared");
                    return (
                      <Text key={it.id} style={[s.small, { marginLeft: 16 }]}>
                        • {it.quantity}× {N(it.name)}
                        {tags.length > 0 ? `  (${tags.join(", ")})` : ""}
                      </Text>
                    );
                  })}
                </View>
              ))}
              {cg.trolley_contents.length > 0 && (
                <View style={{ marginTop: 1 }}>
                  <Text style={[s.small, { color: GRAY, marginLeft: 6 }]}>Trolley contents:</Text>
                  {cg.trolley_contents.map((t) => (
                    <Text key={t.id} style={[s.small, { marginLeft: 16 }]}>
                      • {N(t.quantity)}  {N(t.item_name)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
            );
          })}
        </View>
      ))}
      {soborgLoading.unassigned.concepts.length > 0 && (
        <View style={{ marginTop: 8, padding: 6, border: `1pt solid ${AMBER}` }} wrap={false}>
          <Text style={[s.bold, s.small, s.amber]}>Concepts without vehicle assignment</Text>
          {soborgLoading.unassigned.concepts.map((c) => (
            <Text key={c.contract_id} style={s.small}>
              • {N(c.concept_name)}{c.concept_alias ? ` — ${N(c.concept_alias)}` : ""}
              {c.total_items > 0 ? `  (${c.total_items} items)` : ""}
            </Text>
          ))}
        </View>
      )}
      {soborgLoading.not_loaded_from_soborg.items.length > 0 && (
        <View style={{ marginTop: 8 }} wrap={false}>
          <Text style={[s.bold, s.small, { marginBottom: 2 }]}>Delivered on-site (NOT loaded from Søborg)</Text>
          {soborgLoading.not_loaded_from_soborg.items.map((u) => (
            <Text key={u.id} style={s.small}>
              • {u.quantity}× {N(u.unit_label)}
              {u.container_type ? ` — ${N(u.container_type)}` : ""}
              {u.supplier ? `  (${N(u.supplier)})` : ""}
              {(u.delivery_date || u.pickup_date) ? `  — delivered ${fmt(u.delivery_date)}, picked up ${fmt(u.pickup_date)}` : ""}
            </Text>
          ))}
        </View>
      )}
      <SectionFooter name="Søborg Loading" festival={festival.name} />
    </Page>
  );
}

function BackCoverPage({ data }: { data: BinderData }) {
  const { festival, primaryContacts } = data;
  return (
    <Page size="A4" style={s.coverPage}>
      <Text style={[s.coverTitle, { fontSize: 26 }]}>Emergency Contacts</Text>
      <Text style={[s.coverSub, { marginTop: 8, fontSize: 12 }]}>Hand-carry to festival site</Text>
      <View style={{ marginTop: 36, alignSelf: "stretch" }}>
        {primaryContacts.length === 0 && <Text style={[s.small, { color: GRAY, textAlign: "center" }]}>No primary contacts marked.</Text>}
        {primaryContacts.map((c: any) => (
          <View key={c.id} style={{ marginBottom: 14, padding: 12, border: `0.5pt solid ${LIGHT}`, borderRadius: 6 }}>
            <Text style={[s.bold, { fontSize: 12 }]}>{N(c.full_name)} — {N(c.role)}</Text>
            {c.organization && <Text style={[s.small, { color: GRAY }]}>{N(c.organization)}</Text>}
            <Text style={[s.small, { marginTop: 4 }]}>Phone: {N(c.phone) || "\u2014"}     Email: {N(c.email) || "\u2014"}</Text>
          </View>
        ))}
      </View>
      <Text style={s.coverFooter}>{N(`${festival.name} / v1.0`)}</Text>
    </Page>
  );
}

// ============ MAIN DOCUMENT ============

export type BinderOptions = {
  selected: Record<SectionKey, boolean>;
  includeCovers: boolean;
};

export function BinderDocument({ data, options }: { data: BinderData; options: BinderOptions }) {
  const { selected, includeCovers } = options;
  const sections = BINDER_SECTIONS.filter((s) => selected[s.key]);

  // Estimate ToC pages: cover (1) + ToC (1) = page 3 is first section
  const startingPage = (includeCovers ? 1 : 0) + 1; // ToC always present
  const tocEntries = sections.map((sec, i) => ({ ...sec, page: startingPage + 1 + i })); // rough estimate, 1 page each min

  return (
    <Document title={`${data.festival.name} — Operations Binder`} author="The Fish Project">
      {includeCovers && <CoverPage data={data} />}
      <ToCPage sections={tocEntries} festival={data.festival.name} />
      {sections.map((sec) => {
        switch (sec.key) {
          case "overview": return <OverviewPage key={sec.key} data={data} />;
          case "actions": return <ActionsPage key={sec.key} data={data} />;
          case "contacts": return <ContactsPage key={sec.key} data={data} />;
          case "timeline": return <TimelinePage key={sec.key} data={data} />;
          case "contracts": return <ContractsPage key={sec.key} data={data} />;
          case "transport": return <TransportPage key={sec.key} data={data} />;
          case "topskilt": return <TopskiltPage key={sec.key} data={data} />;
          case "facade": return <FacadePage key={sec.key} data={data} />;
          case "power": return <PowerPage key={sec.key} data={data} />;
          case "cooling": return <CoolingPage key={sec.key} data={data} />;
          case "safety": return <SafetyPage key={sec.key} data={data} />;
          case "accommodation": return <AccommodationPage key={sec.key} data={data} />;
          case "soborg_loading": return <SoborgLoadingPage key={sec.key} data={data} />;
          case "questions": return <QuestionsPage key={sec.key} data={data} />;
          case "rules": return <RulesPage key={sec.key} data={data} />;
          default: return null;
        }
      })}
      {includeCovers && <BackCoverPage data={data} />}
    </Document>
  );
}
