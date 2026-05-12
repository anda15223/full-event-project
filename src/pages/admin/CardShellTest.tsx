import { FestivalCard } from "@/components/festival/FestivalCard";

const FESTIVAL = "jelling-2026";

export default function CardShellTest() {
  return (
    <div className="grid grid-cols-2 gap-4 p-8">
      <FestivalCard
        title="Transport"
        status="green"
        statusLabel="All booked"
        festivalSlug={FESTIVAL}
      >
        <FestivalCard.UploadZone accept=".pdf" />
        <FestivalCard.ParsedFields>
          <p className="text-sm">Sample parsed field placeholder</p>
        </FestivalCard.ParsedFields>
        <FestivalCard.ManualFields>
          <p className="text-sm">Sample manual field placeholder</p>
        </FestivalCard.ManualFields>
        <FestivalCard.ExportButton onClick={() => console.log("export")} />
      </FestivalCard>

      <FestivalCard
        title="Contract — Fish & Chips"
        status="amber"
        statusLabel="Pending signature"
        conceptSlug="fish-chips"
        festivalSlug={FESTIVAL}
      >
        <p className="text-sm">Card body for active concept</p>
      </FestivalCard>

      <FestivalCard
        title="Electricity — Chicks 'n' Buns"
        status="red"
        statusLabel="32A short"
        conceptSlug="chicks"
        festivalSlug={FESTIVAL}
      >
        <p className="text-sm">Card body</p>
      </FestivalCard>

      <FestivalCard
        title="Facade — Gyropolis Gyros"
        status="green"
        statusLabel="Ready"
        conceptSlug="gyros"
        festivalSlug={FESTIVAL}
      >
        <p className="text-sm">This body should be grayed if Gyros is disabled</p>
      </FestivalCard>
    </div>
  );
}
