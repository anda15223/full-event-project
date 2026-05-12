import { useEffect, useState } from "react";
import "@/lib/pdfFonts";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PDFViewer, PDFDownloadLink, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { CONCEPT_LABELS, CONCEPT_EMOJI, ConceptSlug, CONCEPT_SLUGS } from "@/components/concept/types";
import { formatDateRange } from "@/lib/dateFormat";

try {
  Font.register({
    family: "OpenSans",
    fonts: [
      { src: "https://fonts.gstatic.com/s/opensans/v17/mem8YaGs126MiZpBA-UFVZ0e.ttf", fontWeight: 400 },
      { src: "https://fonts.gstatic.com/s/opensans/v17/mem5YaGs126MiZpBA-UN7rgOUuhsKKSTjw.ttf", fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
} catch {}

const RED = "#c0392b";
const GREEN = "#27ae60";
const GRAY = "#666";
const LIGHT = "#ddd";

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Inter", fontSize: 9.5, color: "#111" },
  // Header
  hRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  fName: { fontSize: 18, fontWeight: 700 },
  fSub: { fontSize: 9, color: GRAY, marginTop: 2 },
  slugBadge: { fontSize: 8, color: GRAY, fontFamily: "Courier" },
  // Sections
  sec: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: LIGHT },
  secHdr: { fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 },
  // Status
  countdown: { fontSize: 13, fontWeight: 700 },
  countdownUrgent: { fontSize: 13, fontWeight: 700, backgroundColor: "#fde8e6", padding: 4 },
  buckets: { flexDirection: "row", marginTop: 4, fontSize: 10 },
  bucketsRedBorder: { borderTopWidth: 2, borderTopColor: RED, paddingTop: 4 },
  bucket: { marginRight: 12 },
  // Deadlines table
  drow: { flexDirection: "row", paddingVertical: 1.5 },
  dIcon: { width: 14 },
  dDate: { width: 70, color: GRAY },
  dLabel: { flex: 1 },
  dOwner: { width: 130, color: GRAY, textAlign: "right" },
  // Ops
  opLabel: { fontWeight: 700, marginTop: 4 },
  opLine: { marginLeft: 0 },
  warn: { color: RED },
  ok: { color: GREEN },
  // Concepts
  cRow: { flexDirection: "row", paddingVertical: 1.5 },
  cName: { width: 140 },
  cMgr: { width: 150, color: GRAY },
  cContract: { width: 130 },
  cItems: { flex: 1, color: GRAY, textAlign: "right" },
  // Contacts
  contactLine: { paddingVertical: 1 },
  // Footer
  footer: {
    position: "absolute", bottom: 14, left: 28, right: 28,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: GRAY,
  },
});

interface CoverData {
  festival: any;
  attention: { overdue: number; today: number; this_week: number; later: number };
  criticalCount: number;
  setupCountdownDays: number;
  deadlines: Array<{ iso: string; label: string; owner: string; isOverdueOrToday: boolean }>;
  totalDeadlinesInWindow: number;
  transport: {
    vehicleCount: number; legCount: number; driversFilled: number; driversNeeded: number;
    tbdCount: number; earliestTbd: string | null;
    accreditationsUploaded: number;
  };
  staff: {
    total: number; soborg: number; local: number;
    blankNames: number; missingTransport: number;
  };
  serviceHours: { daysWithHours: number; festivalDays: number };
  concepts: Array<{
    id: string; slug: string; name: string; emoji: string;
    manager: string | null; contractStatus: string;
    inspectionDate: string | null;
    setupCount: number; equipmentCount: number; coolingCount: number; facadeStatus: string | null;
    openItems: number; openCritical: number; openHigh: number; openNormal: number;
  }>;
  contacts: any[];
}

const CONCEPT_ORDER: ConceptSlug[] = ["fish-chips", "gyros", "creperie", "chicks"];

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}
function fmtDateLong(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

async function loadData(slug: string, conceptFilter: ConceptSlug | null): Promise<CoverData | null> {
  const { data: festival } = await supabase
    .from("festivals").select("id, name, slug, start_date, end_date, city, address")
    .eq("slug", slug).maybeSingle();
  if (!festival) return null;
  const fid = festival.id;

  const today = new Date(); today.setHours(0,0,0,0);
  const todayIso = today.toISOString().slice(0,10);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 14);
  const horizonIso = horizon.toISOString().slice(0,10);

  const [
    attentionR, allConcepts, assignR, contractsR, contactsR, hoursR,
    actionsWindowR, criticalR, facadeR, setupAllR,
    transportR, legsR, staffR,
    actionsAllOpenR,
  ] = await Promise.all([
    supabase.from("v_attention_summary").select("*").eq("festival_id", fid).maybeSingle(),
    supabase.from("concepts").select("id, slug, name, display_order").not("display_order", "is", null).order("display_order"),
    supabase.from("festival_concept_assignments").select("concept_id, festival_staff(name)").eq("festival_id", fid).eq("role", "manager"),
    supabase.from("festival_contracts").select("concept_id, contract_signed_date, inspection_date, site_clearance_deadline").eq("festival_id", fid).eq("is_active", true),
    supabase.from("festival_contacts").select("*").eq("festival_id", fid).eq("is_primary", true).order("role"),
    supabase.from("festival_service_hours").select("service_date, concept_id, open_time, close_time").eq("festival_id", fid),
    supabase.from("festival_action_items").select("title, owner, due_date, priority, status").eq("festival_id", fid).neq("status","done").gte("due_date", todayIso).lte("due_date", horizonIso).order("due_date"),
    supabase.from("festival_action_items").select("id", { count: "exact", head: true }).eq("festival_id", fid).neq("status","done").eq("priority","critical"),
    supabase.from("festival_facade_status").select("design_deadline, print_deadline, design_status, concept_id, concept:concepts(name, slug)").eq("festival_id", fid),
    supabase.from("festival_setup").select("scheduled_start_at, description, concept_id").eq("festival_id", fid).not("scheduled_start_at","is",null),
    supabase.from("festival_transport").select("id, accreditation_pdf_path").eq("festival_id", fid),
    supabase.from("transport_legs").select("id, leg_phase, leg_date, transport_id, transport_leg_assignments(role, staff_id)").order("leg_date"),
    supabase.from("festival_staff").select("id, name, role, home_location, requires_transport, concept_id").eq("festival_id", fid),
    supabase.from("festival_action_items").select("concept_id:category, priority, status").eq("festival_id", fid).neq("status","done"),
  ]);

  // Filter legs to this festival's transport ids
  const transportIds = new Set((transportR.data ?? []).map((t: any) => t.id));
  const allLegs = (legsR.data ?? []).filter((l: any) => transportIds.has(l.transport_id));

  // Setup countdown
  const setupLegDates = allLegs
    .filter((l: any) => l.leg_phase === "setup_outbound" || l.leg_phase === "crew_outbound")
    .map((l: any) => l.leg_date).sort();
  let countdownDate: Date;
  if (setupLegDates.length > 0) {
    countdownDate = new Date(setupLegDates[0] + "T00:00:00");
  } else {
    countdownDate = new Date(festival.start_date + "T00:00:00");
    countdownDate.setDate(countdownDate.getDate() - 3);
  }
  const setupCountdownDays = daysBetween(today, countdownDate);

  // Driver stats
  let driversNeeded = allLegs.length;
  let driversFilled = 0;
  let tbdCount = 0;
  let earliestTbd: string | null = null;
  for (const leg of allLegs) {
    const drivers = (leg.transport_leg_assignments ?? []).filter((a: any) => a.role === "driver" && a.staff_id);
    if (drivers.length > 0) driversFilled++;
    else {
      tbdCount++;
      if (!earliestTbd || leg.leg_date < earliestTbd) earliestTbd = leg.leg_date;
    }
  }

  const accreditationsUploaded = (transportR.data ?? []).filter((t: any) => t.accreditation_pdf_path).length;

  // Staff
  const allStaff = staffR.data ?? [];
  const localStaff = allStaff.filter((s: any) => (s.home_location ?? "").toLowerCase() !== "søborg" && (s.home_location ?? "").toLowerCase() !== "soborg");
  const soborg = allStaff.length - localStaff.length;
  const blankNames = localStaff.filter((s: any) => !s.name || s.name.trim() === "").length;
  const staffWithTransportNeed = allStaff.filter((s: any) => s.requires_transport);
  const assignedStaffIds = new Set<string>();
  for (const leg of allLegs) {
    for (const a of (leg.transport_leg_assignments ?? [])) {
      if (a.staff_id) assignedStaffIds.add(a.staff_id);
    }
  }
  const missingTransport = staffWithTransportNeed.filter((s: any) => !assignedStaffIds.has(s.id)).length;

  // Service hours
  const festivalStart = new Date(festival.start_date + "T00:00:00");
  const festivalEnd = new Date(festival.end_date + "T00:00:00");
  const festivalDays = daysBetween(festivalStart, festivalEnd) + 1;
  const daysWithHours = new Set((hoursR.data ?? []).map((h: any) => h.service_date)).size;

  // Deadlines (deduped)
  const dedupMap = new Map<string, { iso: string; label: string; owner: string; isOverdueOrToday: boolean; concepts: Set<string> }>();
  const addDeadline = (iso: string, label: string, owner: string, conceptName?: string | null) => {
    if (!iso || iso < todayIso || iso > horizonIso) return;
    const key = `${iso}::${label}`;
    const isToday = iso === todayIso;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, { iso, label, owner, isOverdueOrToday: isToday, concepts: new Set() });
    }
    if (conceptName) dedupMap.get(key)!.concepts.add(conceptName);
  };
  for (const ai of (actionsWindowR.data ?? [])) {
    if (!ai.due_date) continue;
    addDeadline(ai.due_date, ai.title, ai.owner ?? "—");
  }
  for (const f of (facadeR.data ?? [])) {
    const cn = f.concept?.name ?? null;
    if (f.design_deadline) addDeadline(f.design_deadline, "Facade design deadline", cn ?? "Facade", cn);
    if (f.print_deadline) addDeadline(f.print_deadline, "Facade print deadline", cn ?? "Facade", cn);
  }
  for (const c of (contractsR.data ?? [])) {
    if (c.inspection_date) addDeadline(c.inspection_date, "Inspection", "[Festival-wide]");
    if (c.site_clearance_deadline) {
      const iso = String(c.site_clearance_deadline).slice(0,10);
      addDeadline(iso, "Site clearance", "[Festival-wide]");
    }
  }
  for (const su of (setupAllR.data ?? [])) {
    const iso = String(su.scheduled_start_at).slice(0,10);
    addDeadline(iso, `Setup: ${su.description ?? "start"}`, "[Setup]");
  }

  let deadlinesArr = Array.from(dedupMap.values()).map((d) => {
    let owner = d.owner;
    if (d.concepts.size > 1) owner = "[All concepts]";
    else if (d.concepts.size === 1) owner = Array.from(d.concepts)[0];
    return { iso: d.iso, label: d.label, owner, isOverdueOrToday: d.isOverdueOrToday };
  });

  // Concept filter for deadlines
  if (conceptFilter) {
    const cf = CONCEPT_LABELS[conceptFilter];
    deadlinesArr = deadlinesArr.filter((d) =>
      d.owner === "[Festival-wide]" || d.owner === "[All concepts]" || d.owner === cf || d.owner === "[Setup]"
    );
  }
  deadlinesArr.sort((a, b) => a.iso.localeCompare(b.iso));
  const totalDeadlinesInWindow = deadlinesArr.length;
  const deadlines = deadlinesArr.slice(0, 12);

  // Concepts block
  const managerMap = new Map<string, string>();
  (assignR.data ?? []).forEach((r: any) => {
    if (r.festival_staff?.name) managerMap.set(r.concept_id, r.festival_staff.name);
  });
  const contractMap = new Map<string, any>();
  (contractsR.data ?? []).forEach((r: any) => contractMap.set(r.concept_id, r));
  const facadeMap = new Map<string, any>();
  (facadeR.data ?? []).forEach((r: any) => { if (r.concept_id) facadeMap.set(r.concept_id, r); });

  const setupByConcept = new Map<string, number>();
  (setupAllR.data ?? []).forEach((r: any) => {
    if (r.concept_id) setupByConcept.set(r.concept_id, (setupByConcept.get(r.concept_id) ?? 0) + 1);
  });
  // Equipment + cooling counts per concept
  const [eqR, coolR] = await Promise.all([
    supabase.from("festival_equipment").select("concept_id").eq("festival_id", fid),
    supabase.from("festival_cooling").select("id").eq("festival_id", fid),
  ]);
  const eqByConcept = new Map<string, number>();
  (eqR.data ?? []).forEach((r: any) => {
    if (r.concept_id) eqByConcept.set(r.concept_id, (eqByConcept.get(r.concept_id) ?? 0) + 1);
  });
  const coolingTotal = (coolR.data ?? []).length;

  const conceptList = (allConcepts.data ?? []).slice().sort((a: any, b: any) => {
    const ai = CONCEPT_ORDER.indexOf(a.slug); const bi = CONCEPT_ORDER.indexOf(b.slug);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const concepts = conceptList.map((c: any) => {
    const k = contractMap.get(c.id);
    const status = k?.contract_signed_date ? "signed" : k ? "pending" : "missing";
    const f = facadeMap.get(c.id);
    return {
      id: c.id, slug: c.slug, name: c.name,
      emoji: CONCEPT_EMOJI[c.slug as ConceptSlug] ?? "•",
      manager: managerMap.get(c.id) ?? null,
      contractStatus: status,
      inspectionDate: k?.inspection_date ?? null,
      setupCount: setupByConcept.get(c.id) ?? 0,
      equipmentCount: eqByConcept.get(c.id) ?? 0,
      coolingCount: coolingTotal, // not concept-keyed; show festival total
      facadeStatus: f?.design_status ?? null,
      openItems: 0, openCritical: 0, openHigh: 0, openNormal: 0,
    };
  });

  return {
    festival,
    attention: {
      overdue: attentionR.data?.overdue_count ?? 0,
      today: attentionR.data?.today_count ?? 0,
      this_week: attentionR.data?.this_week_count ?? 0,
      later: attentionR.data?.later_count ?? 0,
    },
    criticalCount: criticalR.count ?? 0,
    setupCountdownDays,
    deadlines,
    totalDeadlinesInWindow,
    transport: {
      vehicleCount: (transportR.data ?? []).length,
      legCount: allLegs.length,
      driversFilled,
      driversNeeded,
      tbdCount,
      earliestTbd,
      accreditationsUploaded,
    },
    staff: {
      total: allStaff.length,
      soborg,
      local: localStaff.length,
      blankNames,
      missingTransport,
    },
    serviceHours: { daysWithHours, festivalDays },
    concepts,
    contacts: contactsR.data ?? [],
  };
}

function Pdf({ data, conceptFilter }: { data: CoverData; conceptFilter: ConceptSlug | null }) {
  const { festival, attention, criticalCount, setupCountdownDays, deadlines, totalDeadlinesInWindow,
    transport, staff, serviceHours, concepts, contacts } = data;
  const ts = new Date().toLocaleString("en-GB");
  const conceptName = conceptFilter ? CONCEPT_LABELS[conceptFilter] : null;

  const urgent = setupCountdownDays >= 0 && setupCountdownDays < 7;
  const hasOverdue = attention.overdue > 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* HEADER */}
        <View style={s.hRow}>
          <View>
            <Text style={s.fName}>{festival.name}</Text>
            <Text style={s.fSub}>
              {formatDateRange(festival.start_date, festival.end_date)}
              {festival.city ? ` · ${festival.city}` : ""} · Generated {ts}
            </Text>
            {conceptName && <Text style={s.fSub}>— {conceptName} only</Text>}
          </View>
          <Text style={s.slugBadge}>{festival.slug}</Text>
        </View>

        {/* STATUS */}
        <View style={s.sec}>
          <Text style={urgent ? s.countdownUrgent : s.countdown}>
            {setupCountdownDays >= 0 ? `${setupCountdownDays} days to setup` : `Setup was ${-setupCountdownDays} days ago`}
            {" · "}{criticalCount} critical items
          </Text>
          <View style={[s.buckets, hasOverdue ? s.bucketsRedBorder : {}]}>
            <Text style={[s.bucket, hasOverdue ? s.warn : {}]}>🚨 {attention.overdue} OVERDUE</Text>
            <Text style={s.bucket}>🔴 {attention.today} TODAY</Text>
            <Text style={s.bucket}>🟡 {attention.this_week} THIS WEEK</Text>
            <Text style={s.bucket}>🟢 {attention.later} LATER</Text>
          </View>
        </View>

        {/* DEADLINES */}
        <View style={s.sec}>
          <Text style={s.secHdr}>KEY DEADLINES (NEXT 14 DAYS)</Text>
          {deadlines.length === 0 && <Text style={{ color: GRAY }}>No deadlines in next 14 days.</Text>}
          {deadlines.map((d, i) => (
            <View key={i} style={s.drow}>
              <Text style={[s.dIcon, d.isOverdueOrToday ? s.warn : {}]}>{d.isOverdueOrToday ? "⚠" : "◆"}</Text>
              <Text style={s.dDate}>{fmtDate(d.iso)}</Text>
              <Text style={s.dLabel}>{d.label}</Text>
              <Text style={s.dOwner}>{d.owner}</Text>
            </View>
          ))}
          {totalDeadlinesInWindow > 12 && (
            <Text style={{ color: GRAY, marginTop: 4 }}>
              …and {totalDeadlinesInWindow - 12} more — see action items
            </Text>
          )}
        </View>

        {/* OPS STATUS */}
        <View style={s.sec}>
          <Text style={s.secHdr}>OPERATIONAL STATUS</Text>

          <Text style={s.opLabel}>TRANSPORT</Text>
          <Text style={s.opLine}>
            {transport.vehicleCount} vehicles · {transport.legCount} legs · {transport.driversFilled} of {transport.driversNeeded} driver slots filled
          </Text>
          {transport.tbdCount > 0 && (
            <Text style={s.warn}>
              ⚠ {transport.tbdCount} drivers TBD{transport.earliestTbd ? ` from ${fmtDate(transport.earliestTbd)}` : ""}
            </Text>
          )}
          {transport.accreditationsUploaded < transport.vehicleCount && (
            <Text style={s.warn}>
              ⚠ Accreditations: {transport.accreditationsUploaded} of {transport.vehicleCount} uploaded
            </Text>
          )}

          <Text style={s.opLabel}>STAFF</Text>
          <Text style={s.opLine}>
            {staff.total} total · {staff.soborg} from Soborg · {staff.local} local hires
          </Text>
          {staff.blankNames > 0 && (
            <Text style={s.warn}>⚠ {staff.blankNames} of {staff.local} local names blank</Text>
          )}
          {staff.missingTransport > 0 && (
            <Text style={s.warn}>⚠ {staff.missingTransport} staff requiring transport without assignments</Text>
          )}

          <Text style={s.opLabel}>SERVICE HOURS</Text>
          <Text style={s.opLine}>
            {serviceHours.daysWithHours} of {serviceHours.festivalDays} festival days have hours set
          </Text>
          {serviceHours.daysWithHours === 0 && (
            <Text style={s.warn}>⚠ Service hours not yet entered for any day</Text>
          )}
        </View>

        {/* CONCEPTS */}
        <View style={s.sec}>
          <Text style={s.secHdr}>{conceptFilter ? "CONCEPT" : "CONCEPTS"}</Text>
          {(conceptFilter ? concepts.filter((c) => c.slug === conceptFilter) : concepts).map((c) => (
            conceptFilter ? (
              <View key={c.id} style={{ marginTop: 2 }}>
                <Text style={{ fontWeight: 700, fontSize: 12 }}>{c.emoji} {c.name}</Text>
                <Text>Manager: {c.manager ?? "unassigned"}</Text>
                <Text>
                  Contract:{" "}
                  <Text style={c.contractStatus === "signed" ? s.ok : s.warn}>{c.contractStatus}</Text>
                  {c.inspectionDate ? ` · Inspection: ${fmtDate(c.inspectionDate)}` : ""}
                </Text>
                <Text>
                  Setup phases: {c.setupCount} · Equipment: {c.equipmentCount} items · Cooling: {c.coolingCount} units
                  {c.facadeStatus ? ` · Facade: ${c.facadeStatus}` : ""}
                </Text>
              </View>
            ) : (
              <View key={c.id} style={s.cRow}>
                <Text style={s.cName}>{c.emoji} {c.name}</Text>
                <Text style={s.cMgr}>Mgr: {c.manager ?? "unassigned"}</Text>
                <Text style={[s.cContract, c.contractStatus === "signed" ? s.ok : s.warn]}>
                  Contract: {c.contractStatus}
                </Text>
                <Text style={s.cItems}>{c.setupCount} setup · {c.equipmentCount} eq</Text>
              </View>
            )
          ))}
        </View>

        {/* CONTACTS */}
        <View style={s.sec}>
          <Text style={s.secHdr}>PRIMARY CONTACTS</Text>
          {contacts.length === 0 && (
            <Text style={{ color: GRAY }}>
              No primary contacts marked yet — add via /festivals/{festival.slug}/contacts
            </Text>
          )}
          {contacts.slice(0, 6).map((c: any) => (
            <Text key={c.id} style={s.contactLine}>
              {c.role}: {c.full_name}
              {c.organization ? ` (${c.organization})` : ""}
              {"   📧 "}{c.email ?? " — "}
              {"   📱 "}{c.phone ?? " — "}
            </Text>
          ))}
          {contacts.length > 6 && (
            <Text style={{ color: GRAY }}>+ {contacts.length - 6} more — see contacts</Text>
          )}
        </View>

        <View style={s.footer} fixed>
          <Text>{festival.name}</Text>
          <Text>{ts}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default function FestivalOverviewExport() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  const conceptParam = search.get("concept");
  const conceptFilter = (CONCEPT_SLUGS as readonly string[]).includes(conceptParam ?? "")
    ? (conceptParam as ConceptSlug) : null;

  const [data, setData] = useState<CoverData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadData(slug, conceptFilter).then((d) => {
      if (!alive) return;
      setData(d); setLoading(false);
    });
    return () => { alive = false; };
  }, [slug, conceptFilter]);

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
  if (!data) return <div className="p-6">Festival not found</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <Link to={`/festivals/${slug}`} className="text-sm text-muted-foreground hover:underline">← Back</Link>
        <div className="text-sm font-medium">
          {conceptFilter ? `${CONCEPT_LABELS[conceptFilter]} brief` : "Festival overview"} — PDF preview
        </div>
        <div className="flex items-center gap-2">
          <PDFDownloadLink
            document={<Pdf data={data} conceptFilter={conceptFilter} />}
            fileName={`${data.festival.name.replace(/\s+/g, "_")}${conceptFilter ? `_${conceptFilter}` : ""}_overview.pdf`}
          >
            {({ loading: dlLoading }) => (
              <Button size="sm" disabled={dlLoading}>
                <Download className="h-4 w-4 mr-1" />
                {dlLoading ? "Preparing…" : "Export PDF"}
              </Button>
            )}
          </PDFDownloadLink>
          <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <PDFViewer style={{ width: "100%", height: "calc(100vh - 57px)", border: 0 }}>
          <Pdf data={data} conceptFilter={conceptFilter} />
        </PDFViewer>
      </div>
    </div>
  );
}
