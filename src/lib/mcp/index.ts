import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listFestivals from "./tools/list-festivals";
import getFestival from "./tools/get-festival";
import listFestivalStaff from "./tools/list-festival-staff";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "full-event-project-mcp",
  title: "Full Event Project MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Full Event Project festival operations app. Use `list_festivals` to discover festivals, `get_festival` for details, and `list_festival_staff` (optionally by contract alias like 'Fish 1') to inspect crew.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listFestivals, getFestival, listFestivalStaff],
});
