"use client";

import { useState } from "react";
import PlacementPanel, { type PlacementData } from "../[id]/edit/PlacementPanel";

export type DemoPerson = {
  id: number;
  name: string;
  /** どんな状態の人か (画面の上に出す) */
  note: string;
  placement: PlacementData;
  kanbanDates: Partial<Record<string, string>>;
};

/** 仮の候補者を切り替えて、進捗 / 日程 のカンバンを試す */
export default function ProgressDemoClient({ people }: { people: DemoPerson[] }) {
  const [selected, setSelected] = useState(people[0].id);
  const person = people.find((p) => p.id === selected) ?? people[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={`rounded-lg border px-3 py-1 text-sm ${p.id === selected ? "border-gray-400 bg-gray-100 font-semibold" : "border-gray-200 bg-white"}`}
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600">{person.note}</p>
      <PlacementPanel
        key={person.id}
        demo
        personId={0}
        personName={person.name}
        initialPlacement={person.placement}
        kanbanDates={person.kanbanDates}
        cardId={null}
        initialInvoices={[]}
        partners={[]}
        deals={[]}
      />
    </div>
  );
}
