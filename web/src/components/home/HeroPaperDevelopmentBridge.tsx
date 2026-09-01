"use client";

import type { Dispatch, SetStateAction } from "react";
import { useActiveDevelopmentTuner } from "@/components/dev/developmentTunerStore";
import { HeroPaperTuner } from "@/components/home/HeroPaperTuner";
import type { HeroPaperTuningByViewport } from "@/components/home/HeroPaperTuning";

type HeroPaperDevelopmentBridgeProps = {
  onChange: Dispatch<SetStateAction<HeroPaperTuningByViewport>>;
};

/** Connects the private Hero tuning contract to DialKit in local development. */
export function HeroPaperDevelopmentBridge({
  onChange,
}: HeroPaperDevelopmentBridgeProps) {
  const activeTuner = useActiveDevelopmentTuner();
  return activeTuner === "home-hero" ? <HeroPaperTuner onChange={onChange} /> : null;
}
