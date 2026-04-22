import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QuestionInput } from "@/components/festival/QuestionInput";
import { ContactsManager } from "@/components/festival/ContactsManager";
import {
  useFestival, useSection, useQuestions, useAnswers
} from "@/hooks/useFestival";

export default function SectionEditor() {
  const { slug, sectionKey } = useParams<{ slug: string; sectionKey: string }>();
  const qc = useQueryClient();
  const { data: festival } = useFestival(slug);
  const { data: section } = useSection(sectionKey);
  const { data: questions = [] } = useQuestions(section?.id);
  const { data: answers = [] } = useAnswers(festival?.id);

  if (!festival || !section) return <div className="text-sm text-muted-foreground">Loading…</div>;

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

      {questions.length === 0 ? (
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
    </div>
  );
}
