import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { CONCEPT_EMOJI, type ConceptSlug } from "@/components/concept/types";

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

type Festival = { id: string; name: string; start_date: string; end_date: string };
type Unit = {
  id: string; unit_label: string; cooling_model: "container" | "pallet_rental" | "festival_provided";
  container_type: string | null; container_count: number | null;
  pallet_count_kol: number | null; pallet_count_frys: number | null;
  supplier: string | null; delivery_date: string | null; pickup_date: string | null;
  cost_dkk: number | null; status: string; notes: string | null;
};
type Contract = {
  id: string; concept_alias: string | null;
  concept: { slug: ConceptSlug; name: string; display_order: number | null } | null;
};
type Link = { cooling_unit_id: string; festival_contract_id: string };

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "OpenSans", fontSize: 10, color: "#111" },
  h1: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  unit: { marginTop: 12, paddingTop: 8, borderTop: "1pt solid #ccc" },
  unitTitle: { fontSize: 12, fontWeight: 700 },
  pillRow: { flexDirection: "row", gap: 6, marginTop: 4, marginBottom: 6 },
  pill: { borderWidth: 0.5, borderColor: "#666", padding: "1pt 4pt", fontSize: 8, borderRadius: 2 },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, gap: 0 },
  field: { width: "33%", marginBottom: 4 },
  fieldLabel: { fontSize: 7, color: "#777", textTransform: "uppercase" },
  fieldValue: { fontSize: 9 },
  conceptsLine: { marginTop: 6, fontSize: 9 },
  notes: { marginTop: 6, fontSize: 9, color: "#333" },
  footer: {
    position: "absolute", bottom: 18, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: "#777",
  },
});

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function contractText(c: Contract) {
  const slug = c.concept?.slug;
  const emoji = slug ? CONCEPT_EMOJI[slug] ?? "" : "";
  const base = c.concept?.name ?? "—";
  return c.concept_alias ? `${emoji} ${base} — ${c.concept_alias}` : `${emoji} ${base}`;
}

function CoolingDoc({
  festival, units, contracts, links, filterLabel,
}: {
  festival: Festival; units: Unit[]; contracts: Contract[]; links: Link[]; filterLabel: string | null;
}) {
  const ts = new Date().toLocaleString("en-GB");
  const contractsById = new Map(contracts.map((c) => [c.id, c]));
  const conceptsByUnit = new Map<string, Contract[]>();
  links.forEach((l) => {
    const c = contractsById.get(l.festival_contract_id);
    if (!c) return;
    if (!conceptsByUnit.has(l.cooling_unit_id)) conceptsByUnit.set(l.cooling_unit_id, []);
    conceptsByUnit.get(l.cooling_unit_id)!.push(c);
  });

  const subtitle = filterLabel ? `Cooling Plan — ${filterLabel}` : "Cooling Plan";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{festival.name}</Text>
        <Text style={styles.meta}>
          {festival.start_date} → {festival.end_date}  ·  Generated {ts}
        </Text>
        <Text style={styles.title}>{subtitle}</Text>

        {units.length === 0 && <Text style={styles.meta}>No cooling units.</Text>}

        {units.map((u) => {
          const served = (conceptsByUnit.get(u.id) ?? [])
            .slice()
            .sort((a, b) => (a.concept?.display_order ?? 999) - (b.concept?.display_order ?? 999));
          return (
            <View key={u.id} wrap={false} style={styles.unit}>
              <Text style={styles.unitTitle}>{u.unit_label}</Text>
              <View style={styles.pillRow}>
                <Text style={styles.pill}>{u.cooling_model.replace("_", " ")}</Text>
                <Text style={styles.pill}>status: {u.status.replace("_", " ")}</Text>
              </View>

              <View style={styles.fieldGrid}>
                {u.cooling_model === "container" && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Type</Text>
                      <Text style={styles.fieldValue}>{u.container_type ?? "—"}</Text>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Count</Text>
                      <Text style={styles.fieldValue}>{u.container_count ?? "—"}</Text>
                    </View>
                  </>
                )}
                {u.cooling_model === "pallet_rental" && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Køl pallets</Text>
                      <Text style={styles.fieldValue}>{u.pallet_count_kol ?? "—"}</Text>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Frys pallets</Text>
                      <Text style={styles.fieldValue}>{u.pallet_count_frys ?? "—"}</Text>
                    </View>
                  </>
                )}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Supplier</Text>
                  <Text style={styles.fieldValue}>{u.supplier ?? "—"}</Text>
                </View>
                {u.cooling_model !== "festival_provided" && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Delivery</Text>
                      <Text style={styles.fieldValue}>{fmtDate(u.delivery_date)}</Text>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Pickup</Text>
                      <Text style={styles.fieldValue}>{fmtDate(u.pickup_date)}</Text>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Cost (DKK)</Text>
                      <Text style={styles.fieldValue}>{u.cost_dkk != null ? u.cost_dkk.toLocaleString("da-DK") : "—"}</Text>
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.conceptsLine}>
                Concepts served: {served.length === 0 ? "—" : served.map(contractText).join(", ")}
              </Text>

              {u.notes && <Text style={styles.notes}>Notes: {u.notes}</Text>}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>{festival.name}</Text>
          <Text>{ts}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default function FestivalCoolingExport() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const filterContract = params.get("contract");
  const filterConcept = params.get("concept");

  const [festival, setFestival] = useState<Festival | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const f = await supabase.from("festivals")
        .select("id,name,start_date,end_date").eq("slug", slug).maybeSingle();
      if (!alive || !f.data) { setLoading(false); return; }
      const fid = (f.data as any).id as string;

      const [uRes, cRes] = await Promise.all([
        supabase.from("festival_cooling_unit").select("*").eq("festival_id", fid).order("created_at"),
        supabase.from("festival_contracts")
          .select("id, concept_alias, concept:concepts(slug, name, display_order)")
          .eq("festival_id", fid),
      ]);
      const us = (uRes.data ?? []) as Unit[];
      const cs = (cRes.data ?? []) as unknown as Contract[];
      const lRes = us.length > 0
        ? await supabase.from("festival_cooling_unit_concepts")
            .select("cooling_unit_id, festival_contract_id")
            .in("cooling_unit_id", us.map((u) => u.id))
        : { data: [] as any[] };

      if (!alive) return;
      setFestival(f.data as Festival);
      setUnits(us);
      setContracts(cs);
      setLinks((lRes.data ?? []) as Link[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }
  if (!festival) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Festival not found.</div>;
  }

  // Filter units based on query params
  let filteredUnits = units;
  let filterLabel: string | null = null;
  if (filterContract) {
    const ids = new Set(links.filter((l) => l.festival_contract_id === filterContract).map((l) => l.cooling_unit_id));
    filteredUnits = units.filter((u) => ids.has(u.id));
    const c = contracts.find((c) => c.id === filterContract);
    filterLabel = c ? contractText(c) : "selected contract";
  } else if (filterConcept) {
    const matchingContracts = contracts.filter((c) => c.concept?.slug === filterConcept);
    const ids = new Set<string>();
    matchingContracts.forEach((c) => {
      links.filter((l) => l.festival_contract_id === c.id).forEach((l) => ids.add(l.cooling_unit_id));
    });
    filteredUnits = units.filter((u) => ids.has(u.id));
    filterLabel = matchingContracts[0]?.concept?.name ?? filterConcept;
  }

  const doc = (
    <CoolingDoc
      festival={festival}
      units={filteredUnits}
      contracts={contracts}
      links={links}
      filterLabel={filterLabel}
    />
  );

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <Link to={`/festivals/${slug}/cooling`} className="text-sm text-muted-foreground hover:underline">
          ← Back to cooling
        </Link>
        <PDFDownloadLink
          document={doc}
          fileName={`cooling-${slug}${filterLabel ? "-" + filterLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : ""}.pdf`}
        >
          {({ loading: dlLoading }) => (
            <Button size="sm" disabled={dlLoading}>
              <Download className="h-4 w-4" />
              {dlLoading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" style={{ border: 0 }}>
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
