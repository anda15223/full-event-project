import type { ContractSummary } from "@/lib/parseContract";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  summary: ContractSummary;
}

function isTbd(v: string | undefined | null) {
  if (!v) return true;
  const t = String(v).trim();
  return t === "" || t.toUpperCase() === "TBD";
}

function Bullets({ items }: { items: Array<string | null | undefined> }) {
  return (
    <ul className="list-disc list-inside space-y-1 text-[12px]">
      {items.filter(Boolean).map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function ContractSummaryView({ summary }: Props) {
  const s = summary;

  return (
    <Accordion
      type="multiple"
      defaultValue={["festival", "dates", "deadlines", "obligations"]}
      className="w-full"
    >
      <AccordionItem value="festival">
        <AccordionTrigger className="text-[13px]">Festival &amp; Parties</AccordionTrigger>
        <AccordionContent>
          <Bullets
            items={[
              `Festival: ${s.festival.name}`,
              `Festival entity: ${s.festival.festival_entity}`,
              `Stadeholder: ${s.festival.stadeholder_entity}`,
            ]}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="dates">
        <AccordionTrigger className="text-[13px]">Dates</AccordionTrigger>
        <AccordionContent>
          <Bullets
            items={[
              `Festival days: ${(s.dates.festival_days ?? []).join(", ") || "TBD"}`,
              `Opening hours: ${(s.dates.opening_hours ?? []).join(", ") || "TBD"}`,
              `Setup access: ${s.dates.setup_access}`,
              `Camping: ${s.dates.camping}`,
            ]}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="contacts">
        <AccordionTrigger className="text-[13px]">Contacts</AccordionTrigger>
        <AccordionContent>
          {s.contacts.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">TBD</div>
          ) : (
            <ul className="list-disc list-inside space-y-1 text-[12px]">
              {s.contacts.map((c, i) => {
                const parts = [`${c.role}: ${c.name}`];
                if (!isTbd(c.email)) parts.push(c.email);
                if (!isTbd(c.phone)) parts.push(c.phone);
                return <li key={i}>{parts.join(" · ")}</li>;
              })}
            </ul>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="menu">
        <AccordionTrigger className="text-[13px]">Menu</AccordionTrigger>
        <AccordionContent>
          {s.menu.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">TBD</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Item</TableHead>
                    <TableHead className="text-[11px]">Concept</TableHead>
                    <TableHead className="text-[11px]">LF</TableHead>
                    <TableHead className="text-[11px]">GF</TableHead>
                    <TableHead className="text-[11px]">Veg</TableHead>
                    <TableHead className="text-[11px]">Vegan</TableHead>
                    <TableHead className="text-[11px]">Local</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.menu.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[12px]">{m.item}</TableCell>
                      <TableCell className="text-[12px]">{m.concept}</TableCell>
                      <TableCell className="text-[12px]">{m.lactose_free}</TableCell>
                      <TableCell className="text-[12px]">{m.gluten_free}</TableCell>
                      <TableCell className="text-[12px]">{m.vegetarian}</TableCell>
                      <TableCell className="text-[12px]">{m.vegan}</TableCell>
                      <TableCell className="text-[12px]">{m.local}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="location">
        <AccordionTrigger className="text-[13px]">Location</AccordionTrigger>
        <AccordionContent>
          <Bullets
            items={[
              `Venue: ${s.location.venue}`,
              `Kommune: ${s.location.kommune}`,
              `Stand placement: ${s.location.stand_placement_status}`,
            ]}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cost">
        <AccordionTrigger className="text-[13px]">Cost</AccordionTrigger>
        <AccordionContent>
          <Bullets
            items={[
              `Commission: ${s.cost.commission_pct}`,
              `Deposit: ${s.cost.deposit}`,
              `Penalty per breach: ${s.cost.penalty_per_breach}`,
              `IP / breach penalty: ${s.cost.ip_breach_penalty}`,
              `Late order fee: ${s.cost.late_order_fee}`,
              `Meal ticket: ${s.cost.meal_ticket_price}`,
              `Settlement: ${s.cost.settlement_terms}`,
            ]}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="deadlines">
        <AccordionTrigger className="text-[13px]">Deadlines</AccordionTrigger>
        <AccordionContent>
          {s.deadlines.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">TBD</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] whitespace-nowrap">Date</TableHead>
                    <TableHead className="text-[11px]">What</TableHead>
                    <TableHead className="text-[11px]">Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.deadlines.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[12px] whitespace-nowrap">{d.date}</TableCell>
                      <TableCell className="text-[12px]">{d.item}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{d.clause_ref}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="obligations">
        <AccordionTrigger className="text-[13px]">Obligations</AccordionTrigger>
        <AccordionContent>
          {s.obligations.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">TBD</div>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-[12px]">
              {s.obligations.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
