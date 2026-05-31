import { useSearchParams } from "react-router-dom";

/**
 * Draft preview mode. When ?draft=1 is in the URL, festival cards show
 * draft rows instead of live rows, letting the user edit/delete them
 * before promoting via "Set up for this event".
 */
export function useDraftMode(): {
  draftMode: boolean;
  setDraftMode: (on: boolean) => void;
} {
  const [params, setParams] = useSearchParams();
  const draftMode = params.get("draft") === "1";
  const setDraftMode = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set("draft", "1");
    else next.delete("draft");
    setParams(next, { replace: true });
  };
  return { draftMode, setDraftMode };
}
