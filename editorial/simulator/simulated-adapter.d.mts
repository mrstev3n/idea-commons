import type { AdapterResult, SimulatorScenario, SourceExcerpt } from "../../web/src/server/types";

export interface SimulatedAdapterInput {
  sourceId: string;
  language: string;
  title: string;
  sourceFingerprint: string;
  rightsBasis: string;
  excerpts: SourceExcerpt[];
}

export function runSimulatedAdapter(input: SimulatedAdapterInput, scenario?: SimulatorScenario): AdapterResult;
