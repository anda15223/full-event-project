import { useEffect, useState, type ReactNode } from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Concept, ConceptManager, ConceptSlug, CONCEPT_LABELS } from "./types";
import { formatDateRange } from "@/lib/dateFormat";

// Open Sans for Unicode glyphs (arrows, dashes, accents). Registered once.
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

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "OpenSans", fontSize: 10, color: "#111" },
  festivalName: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  conceptBlock: { marginTop: 14, paddingTop: 8, borderTop: "1pt solid #ddd" },
  conceptHeader: { fontSize: 12, fontWeight: 700 },
  manager: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 4 },
  footer: {
    position: "absolute", bottom: 18, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: "#777",
  },
});

interface Props {
  festivalId: string;
  cardTitle: string;
  conceptFilter: ConceptSlug | null;
  conceptData: Record<string, any>;
  renderConceptSection: (concept: Concept, data: any, manager: ConceptManager | null) => JSX.Element;
}

export function useConceptExportData(festivalId: string) {
  const [festival, setFestival] = useState<{ name: string; start_date: string; end_date: string } | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [managers, setManagers] = useState<Map<string, ConceptManager>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [f, c, a] = await Promise.all([
        supabase.from("festivals").select("name, start_date, end_date").eq("id", festivalId).maybeSingle(),
        supabase.from("concepts").select("id, slug, name, display_order, color_hex, short_name")
          .not("display_order", "is", null).order("display_order", { ascending: true }),
        supabase.from("festival_concept_assignments")
          .select("concept_id, manager_staff_id, festival_staff(id, name)")
          .eq("festival_id", festivalId).eq("role", "manager"),
      ]);
      if (!alive) return;
      setFestival((f.data as any) ?? null);
      setConcepts(((c.data ?? []) as unknown) as Concept[]);
      const m = new Map<string, ConceptManager>();
      (a.data ?? []).forEach((row: any) => {
        m.set(row.concept_id, {
          concept_id: row.concept_id,
          manager_staff_id: row.manager_staff_id,
          manager_name: row.festival_staff?.name ?? null,
        });
      });
      setManagers(m);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [festivalId]);

  return { festival, concepts, managers, loading };
}

export function ConceptExportPDF({
  festivalId,
  cardTitle,
  conceptFilter,
  conceptData,
  renderConceptSection,
}: Props) {
  // Note: this component is a Document — data must be fetched by caller and passed,
  // or you can use the hook above + render <ConceptExportPDF .../> only when ready.
  // For convenience we accept a "preloaded" pattern via DataDoc below.
  return (
    <DataDoc
      festivalId={festivalId}
      cardTitle={cardTitle}
      conceptFilter={conceptFilter}
      conceptData={conceptData}
      renderConceptSection={renderConceptSection}
    />
  );
}

function DataDoc(props: Props) {
  const { festival, concepts, managers, loading } = useConceptExportData(props.festivalId);
  const ts = new Date().toLocaleString("en-GB");

  if (loading || !festival) {
    return (
      <Document>
        <Page size="A4" style={styles.page}><Text>Loading…</Text></Page>
      </Document>
    );
  }

  const filtered = props.conceptFilter
    ? concepts.filter((c) => c.slug === props.conceptFilter)
    : concepts;

  const subtitle = props.conceptFilter
    ? `${props.cardTitle} — ${CONCEPT_LABELS[props.conceptFilter]} only`
    : props.cardTitle;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.festivalName}>{festival.name}</Text>
          <Text style={styles.meta}>
            {formatDateRange(festival.start_date, festival.end_date)}  ·  Generated {ts}
          </Text>
          <Text style={styles.title}>{subtitle}</Text>
        </View>

        {filtered.map((c) => {
          const mgr = managers.get(c.id) ?? null;
          const label = CONCEPT_LABELS[c.slug as ConceptSlug] ?? c.name;
          return (
            <View key={c.id} wrap={false} style={styles.conceptBlock}>
              <Text style={styles.conceptHeader}>{label}</Text>
              <Text style={styles.manager}>
                Manager: {mgr?.manager_name ?? "unassigned"}
              </Text>
              {props.renderConceptSection(c, props.conceptData[c.id], mgr)}
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
