import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QuestionInput } from "@/components/festival/QuestionInput";
import { ContactsManager } from "@/components/festival/ContactsManager";
import { SmartCard } from "@/components/festival/SmartCard";
import { SectionPageChat } from "@/components/festival/SectionPageChat";
import {
  useFestival, useSection, useQuestions, useAnswers, useConcepts
} from "@/hooks/useFestival";

/** Per-section SmartCard configuration. If a section key is in this map,
 *  a SmartCard (uploads + AI extract + brain-grab + editable sections/lines)
 *  is rendered below the question form. */
const SMART_CARDS: Record<string, { title: string; subtitle?: string; warning?: { label: string; description?: string } }> = {
  equipment_list: {
    title: "Equipment list",
    subtitle: "Upload supplier offers, packing lists or photos. AI will turn them into editable sections.",
    warning: { label: "No equipment registered yet", description: "Upload a list, grab from Brain, or add a section manually." },
  },
  cooling_storage: {
    title: "Cooling & storage",
    subtitle: "Upload Godik booking confirmations, container photos or cooling layouts.",
    warning: { label: "No cooling/storage info yet", description: "Add at least the container booking and capacity." },
  },
  cooking_equipment: {
    title: "Cooking equipment",
    subtitle: "Upload kitchen equipment lists, gas hookup info, supplier offers.",
    warning: { label: "No cooking equipment yet", description: "Add stoves, fryers, ovens, gas, water hookups." },
  },
  safety_compliance: {
    title: "Safety & compliance",
    subtitle: "Upload fire safety PDFs, food handling certs, insurance docs. AI will read them.",
    warning: { label: "No safety documents uploaded", description: "Compliance docs, fire plan and certificates are required before opening." },
  },
  power: {
    title: "Power requirements",
    subtitle: "Upload power plans, generator offers, electrician quotes or site power maps. AI will extract loads & circuits.",
    warning: { label: "No power info yet", description: "Add baseline kW per concept, generator size, and any extras." },
  },
};

export default function SectionEditor() {
  const { slug, sectionKey } = useParams<{ slug: string; sectionKey: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const { data: section } = useSection(sectionKey);
  const { data: questions = [] } = useQuestions(section?.id);
  const { data: answers = [] } = useAnswers(festival?.id);
  const { data: concepts = [] } = useConcepts(festival?.id);

  if (!festival || !section) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const isPerConcept = sectionKey === "cooking_equipment";

  const answerFor = (qid: string) => answers.find(a => a.question_id === qid);

  const upsertAnswer = async (questionId: string, valueType: string, value: any) => {
    if (!festival) return;
    const { error } = await supabase
      .from("festival_answers")
      .upsert(
        { festival_id: festival.id, question_id: questionId, value, value_type: valueType },
        { onConflict: "festival_id,question_id" }
      );
    if (error) { toast.error("Save failed"); return; }
    qc.invalidateQueries({ queryKey: ["festival_answers", festival.id] });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/festivals/${slug}`}><ArrowLeft className="h-4 w-4 mr-1" />Back to {festival.name}</Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{section.title}</h1>
        {section.description && (
          <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
        )}
      </div>

      {/* SmartCard FIRST so it's the primary surface for these sections */}
      {sectionKey && SMART_CARDS[sectionKey] && festival && (
        isPerConcept ? (
          concepts.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No concepts yet. Add concepts first to create per-concept {SMART_CARDS[sectionKey].title.toLowerCase()} cards.
            </Card>
          ) : (
            <div className="space-y-6">
              {concepts.map((c: any) => (
                <SmartCard
                  key={c.id}
                  cardKey={sectionKey}
                  festivalId={festival.id}
                  conceptId={c.id}
                  title={`${SMART_CARDS[sectionKey].title} — ${c.name}`}
                  subtitle={SMART_CARDS[sectionKey].subtitle}
                  emptyStateWarning={SMART_CARDS[sectionKey].warning}
                  siblingConcepts={concepts.map((x: any) => ({ id: x.id, name: x.name }))}
                />
              ))}
            </div>
          )
        ) : (
          <SmartCard
            cardKey={sectionKey}
            festivalId={festival.id}
            title={SMART_CARDS[sectionKey].title}
            subtitle={SMART_CARDS[sectionKey].subtitle}
            emptyStateWarning={SMART_CARDS[sectionKey].warning}
          />
        )
      )}

      {sectionKey && SMART_CARDS[sectionKey] ? null : questions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No scalar questions in this section. {section.sub_editor_route ? "Use the sub-editor instead." : ""}
        </Card>
      ) : (
        <Card className="p-6 space-y-5">
          {questions.map(q => {
            const a = answerFor(q.id);
            return (
              <QuestionInput
                key={q.id}
                question={q as any}
                currentValue={a?.value}
                onChange={(v) => upsertAnswer(q.id, q.kind, v)}
              />
            );
          })}
          <p className="text-[11px] text-muted-foreground pt-3 border-t border-border/40">
            Changes autosave (500ms debounce on text/number/date, instant on selects).
          </p>
        </Card>
      )}

      {sectionKey === "intro" && festival && (
        <ContactsManager festivalId={festival.id} />
      )}

      {festival && sectionKey && (
        <SectionPageChat
          festivalId={festival.id}
          sectionKey={sectionKey}
          sectionTitle={section.title}
        />
      )}
    </div>
  );
}

