import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PDFViewer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { CONCEPT_LABELS, ConceptSlug, CONCEPT_SLUGS } from "@/components/concept/types";

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

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "OpenSans", fontSize: 10, color: "#111" },
  h1: { fontSize: 18, fontWeight: 700 },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  row: { flexDirection: "row", gap: 8 },
  pill: { fontSize: 8, padding: 3, border: "1pt solid #aaa", borderRadius: 3, marginRight: 4, marginBottom: 4 },
  block: { marginTop: 10, paddingTop: 6, borderTop: "1pt solid #ddd" },
  conceptHeader: { fontSize: 12, fontWeight: 700 },
  small: { fontSize: 9, color: "#333", marginTop: 2 },
  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#999" },
  th: { padding: 3, fontSize: 8, fontWeight: 700 },
  td: { padding: 3, fontSize: 9 },
  footer: {
    position: "absolute", bottom: 18, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: "#777",
  },
});

interface OverviewData {
  festival: any;
  concepts: any[];
  managers: Map<string, { name: string | null }>;
  contracts: Map<string, any>;
  contacts: any[];
  hours: any[];
  actions: any[];
  keyDates: { iso: string; label: string }[];
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}
function fmtTime(t: string | null) { return t ? t.slice(0, 5) : "—"; }

async function loadData(slug: string): Promise<OverviewData | null> {
  const { data: festival } = await supabase
    .from("festivals").select("id, name, slug, start_date, end_date, city, address")
    .eq("slug", slug).maybeSingle();
  if (!festival) return null;
  const fid = festival.id;

  const [concepts, assignments, contracts, contacts, hours, actions, facade, setup] = await Promise.all([
    supabase.from("concepts").select("id, slug, name, display_order")
      .not("display_order", "is", null).order("display_order"),
    supabase.from("festival_concept_assignments")
      .select("concept_id, manager_staff_id, festival_staff(name)")
      .eq("festival_id", fid).eq("role", "manager"),
    supabase.from("festival_contracts")
      .select("concept_id, contract_signed_date, inspection_date, site_clearance_deadline").eq("festival_id", fid),
    supabase.from("festival_contacts").select("*").eq("festival_id", fid).eq("is_primary", true),
    supabase.from("festival_service_hours").select("*").eq("festival_id", fid).order("service_date"),
    supabase.from("festival_action_items").select("title, description, due_date, priority, status, owner")
      .eq("festival_id", fid).neq("status", "closed"),
    supabase.from("festival_facade_status")
      .select("design_deadline, print_deadline, concept:concepts(name)").eq("festival_id", fid),
    supabase.from("festival_setup").select("scheduled_start_at, description")
      .eq("festival_id", fid).not("scheduled_start_at", "is", null)
      .order("scheduled_start_at").limit(1),
  ]);

  const managers = new Map<string, { name: string | null }>();
  (assignments.data ?? []).forEach((r: any) => managers.set(r.concept_id, { name: r.festival_staff?.name ?? null }));
  const contractsMap = new Map<string, any>();
  (contracts.data ?? []).forEach((r: any) => contractsMap.set(r.concept_id, r));

  const keyDates: { iso: string; label: string }[] = [];
  (contracts.data ?? []).forEach((r: any) => {
    if (r.inspection_date) keyDates.push({ iso: r.inspection_date, label: "Inspection" });
    if (r.site_clearance_deadline) keyDates.push({
      iso: String(r.site_clearance_deadline).slice(0, 10), label: "Site clearance",
    });
  });
  (facade.data ?? []).forEach((r: any) => {
    const cn = r.concept?.name ? ` (${r.concept.name})` : "";
    if (r.design_deadline) keyDates.push({ iso: r.design_deadline, label: `Façade design${cn}` });
    if (r.print_deadline) keyDates.push({ iso: r.print_deadline, label: `Façade print${cn}` });
  });
  (setup.data ?? []).forEach((r: any) => keyDates.push({
    iso: String(r.scheduled_start_at).slice(0, 10), label: `Setup: ${r.description ?? "start"}`,
  }));
  keyDates.sort((a, b) => a.iso.localeCompare(b.iso));

  return {
    festival, concepts: concepts.data ?? [], managers, contracts: contractsMap,
    contacts: contacts.data ?? [], hours: hours.data ?? [], actions: actions.data ?? [],
    keyDates,
  };
}

function Pdf({ data, conceptFilter }: { data: OverviewData; conceptFilter: ConceptSlug | null }) {
  const { festival, concepts, managers, contracts, contacts, hours, actions, keyDates } = data;
  const filteredConcepts = conceptFilter ? concepts.filter((c) => c.slug === conceptFilter) : concepts;
  const ts = new Date().toLocaleString("en-GB");
  const subtitle = conceptFilter ? `Concept brief — ${CONCEPT_LABELS[conceptFilter]}` : "Festival Overview";

  const filteredActions = actions
    .slice()
    .sort((a, b) => {
      const order: any = { critical: 1, high: 2, normal: 3 };
      return ((order[a.priority] ?? 4) - (order[b.priority] ?? 4)) ||
        ((a.due_date ?? "") > (b.due_date ?? "") ? 1 : -1);
    });

  const dates = Array.from(new Set(hours.map((h) => h.service_date))).sort();

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{festival.name}</Text>
        <Text style={s.meta}>
          {fmtDate(festival.start_date)} – {fmtDate(festival.end_date)}
          {festival.city ? ` · ${festival.city}` : ""} · Generated {ts}
        </Text>
        <Text style={s.h2}>{subtitle}</Text>

        {!conceptFilter && keyDates.length > 0 && (
          <View>
            <Text style={s.h2}>Key dates</Text>
            {keyDates.map((kd, i) => (
              <Text key={i} style={s.small}>• {fmtDate(kd.iso)} — {kd.label}</Text>
            ))}
          </View>
        )}

        {(!conceptFilter || true) && contacts.length > 0 && (
          <View>
            <Text style={s.h2}>Primary contacts</Text>
            {contacts.map((c: any) => (
              <Text key={c.id} style={s.small}>
                • {c.role}: {c.full_name}
                {c.organization ? ` (${c.organization})` : ""}
                {c.email ? ` — ${c.email}` : ""}{c.phone ? ` — ${c.phone}` : ""}
              </Text>
            ))}
          </View>
        )}

        {dates.length > 0 && (
          <View>
            <Text style={s.h2}>Service hours</Text>
            {dates.map((d) => {
              const fest = hours.find((h) => h.service_date === d && !h.concept_id);
              const overrides = hours.filter((h) => h.service_date === d && h.concept_id);
              const relevant = conceptFilter
                ? overrides.filter((o) => filteredConcepts.find((c) => c.id === o.concept_id))
                : overrides;
              return (
                <View key={d} style={s.table}>
                  <Text style={s.small}>
                    {fmtDate(d)} — festival-wide: {fest ? `${fmtTime(fest.open_time)}–${fmtTime(fest.close_time)}` : "(none)"}
                  </Text>
                  {relevant.map((o) => {
                    const c = concepts.find((x) => x.id === o.concept_id);
                    return (
                      <Text key={o.id} style={s.small}>
                        {"  "}↳ {c?.name ?? "?"}: {fmtTime(o.open_time)}–{fmtTime(o.close_time)}
                      </Text>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        <Text style={s.h2}>{conceptFilter ? "Concept" : "Concepts"}</Text>
        {filteredConcepts.map((c: any) => {
          const mgr = managers.get(c.id);
          const k = contracts.get(c.id);
          const status = k?.contract_signed_date ? "signed" : k ? "pending" : "missing";
          return (
            <View key={c.id} wrap={false} style={s.block}>
              <Text style={s.conceptHeader}>{c.name}</Text>
              <Text style={s.small}>Manager: {mgr?.name ?? "unassigned"}</Text>
              <Text style={s.small}>Contract: {status}</Text>
            </View>
          );
        })}

        {filteredActions.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={s.h2}>Open action items</Text>
            {filteredActions.slice(0, conceptFilter ? 20 : 10).map((a: any, i: number) => (
              <Text key={i} style={s.small}>
                • [{a.priority ?? "normal"}] {a.title}
                {a.due_date ? ` — due ${fmtDate(a.due_date)}` : ""}
                {a.owner ? ` — ${a.owner}` : ""}
              </Text>
            ))}
          </View>
        )}

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

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadData(slug).then((d) => {
      if (!alive) return;
      setData(d); setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

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
        <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
      </div>
      <div className="flex-1">
        <PDFViewer style={{ width: "100%", height: "100%", border: 0 }}>
          <Pdf data={data} conceptFilter={conceptFilter} />
        </PDFViewer>
      </div>
    </div>
  );
}
