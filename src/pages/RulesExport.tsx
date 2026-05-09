import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Document, Page, Text, View, StyleSheet, PDFViewer, PDFDownloadLink, Font,
} from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

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

type Rule = {
  id: string;
  rule_name: string;
  rule_description: string;
  severity: "critical" | "important" | "info";
  category: string | null;
  applies_to_festivals: string[] | null;
  applies_to_operators: string[] | null;
  source: string | null;
  effective_from: string | null;
  effective_until: string | null;
  active: boolean;
};

const LEVEL_LABEL = { critical: "Critical Rules", important: "Important Rules", info: "Info / Background" };
const LEVEL_COLOR = { critical: "#dc2626", important: "#ea580c", info: "#2563eb" };
const LEVEL_BG = { critical: "#fef2f2", important: "#fff7ed", info: "#eff6ff" };

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "OpenSans", fontSize: 10, color: "#111" },
  h1: { fontSize: 18, fontWeight: 700 },
  meta: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 14 },
  sectionHeader: { marginTop: 14, marginBottom: 8, padding: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: 700 },
  card: { borderWidth: 0.5, borderColor: "#ddd", borderLeftWidth: 3, borderRadius: 3, padding: 8, marginBottom: 6 },
  ruleTitle: { fontSize: 11, fontWeight: 700 },
  ruleDesc: { marginTop: 4, lineHeight: 1.35, color: "#222" },
  metaRow: { marginTop: 4, color: "#555", fontSize: 8 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#888" },
});

function RulesDoc({ rules, today }: { rules: Rule[]; today: string }) {
  const groups: Record<string, Rule[]> = { critical: [], important: [], info: [] };
  rules.filter((r) => r.active).forEach((r) => groups[r.severity]?.push(r));

  return (
    <Document title="Operations Rulebook">
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Operations Rulebook</Text>
        <Text style={styles.meta}>The Fish Project · Active rules as of {today}</Text>

        {(["critical", "important", "info"] as const).map((level) => {
          const list = groups[level];
          if (!list.length) return null;
          return (
            <View key={level}>
              <View style={[styles.sectionHeader, { backgroundColor: LEVEL_BG[level] }]}>
                <Text style={[styles.sectionTitle, { color: LEVEL_COLOR[level] }]}>
                  {LEVEL_LABEL[level]} ({list.length})
                </Text>
              </View>
              {list.map((r) => (
                <View key={r.id} style={[styles.card, { borderLeftColor: LEVEL_COLOR[level] }]} wrap={false}>
                  <Text style={styles.ruleTitle}>{r.rule_name}</Text>
                  <Text style={styles.ruleDesc}>{r.rule_description}</Text>
                  <Text style={styles.metaRow}>
                    {r.category ? `${r.category.replace(/_/g, " ")} · ` : ""}
                    {r.applies_to_festivals && r.applies_to_festivals.length > 0
                      ? `Festivals: ${r.applies_to_festivals.join(", ")} · `
                      : "All festivals · "}
                    {r.applies_to_operators && r.applies_to_operators.length > 0
                      ? `Operators: ${r.applies_to_operators.join(", ")} · ` : ""}
                    {r.source ? `Source: ${r.source}` : ""}
                    {r.effective_from ? ` · From ${r.effective_from}` : ""}
                    {r.effective_until ? ` · Until ${r.effective_until}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `Operations rulebook — printed ${today}    ·    Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export default function RulesExport() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("cross_festival_rules")
        .select("*")
        .eq("visibility", "public")
        .order("severity")
        .order("rule_name");
      setRules((data ?? []) as Rule[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between border-b p-3 bg-white">
        <Link to="/rules" className="text-sm text-primary hover:underline">← Back to rules</Link>
        <PDFDownloadLink document={<RulesDoc rules={rules} today={today} />} fileName={`operations-rulebook-${today}.pdf`}>
          {({ loading: l }) => (
            <Button disabled={l} size="sm">
              {l ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          )}
        </PDFDownloadLink>
      </div>
      <div className="flex-1">
        <PDFViewer width="100%" height="100%" showToolbar={false}>
          <RulesDoc rules={rules} today={today} />
        </PDFViewer>
      </div>
    </div>
  );
}
