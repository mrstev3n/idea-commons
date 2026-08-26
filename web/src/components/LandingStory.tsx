import { LandingEndSections } from "@/components/home/LandingEndSections";
import { RecentCollections, type RecentCollectionIdea } from "@/components/home/RecentCollections";
import { SignalsAndThemes } from "@/components/home/SignalsAndThemes";
import { SourceOrigins } from "@/components/home/SourceOrigins";

type LandingStoryProps = {
  ideas: RecentCollectionIdea[];
};

export function LandingStory({ ideas }: LandingStoryProps) {
  return (
    <>
      <SourceOrigins />
      <SignalsAndThemes ideas={ideas} />
      <RecentCollections ideas={ideas} />
      <LandingEndSections />
    </>
  );
}
