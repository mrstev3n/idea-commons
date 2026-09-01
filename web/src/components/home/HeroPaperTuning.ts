export type HeroPaperTuning = {
  group: {
    positionX: number;
    positionY: number;
    scale: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    perspective: number;
  };
  paper: {
    positionX: number;
    positionY: number;
    scale: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    cameraFov: number;
  };
  text: {
    positionX: number;
    positionY: number;
    scale: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
  };
};

export type HeroPaperViewport = "desktop" | "tablet" | "mobile";

export type HeroPaperTuningByViewport = Record<
  HeroPaperViewport,
  HeroPaperTuning
>;

export const HERO_PAPER_TUNING_DEFAULTS: HeroPaperTuningByViewport = {
  desktop: {
    group: {
      positionX: 5,
      positionY: 79,
      scale: 0.9,
      rotationX: 0,
      rotationY: 6,
      rotationZ: 6,
      perspective: 1200,
    },
    paper: {
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotationX: -1.5,
      rotationY: 0,
      rotationZ: 0,
      cameraFov: 24,
    },
    text: {
      positionX: -25,
      positionY: -100,
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0.5,
    },
  },
  tablet: {
    group: {
      positionX: -28,
      positionY: -7,
      scale: 0.87,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 6,
      perspective: 1200,
    },
    paper: {
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotationX: -1.5,
      rotationY: 0,
      rotationZ: 0,
      cameraFov: 24,
    },
    text: {
      positionX: -24,
      positionY: -65,
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    },
  },
  mobile: {
    group: {
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      perspective: 1200,
    },
    paper: {
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotationX: -1.5,
      rotationY: 0,
      rotationZ: 0,
      cameraFov: 24,
    },
    text: {
      positionX: 0,
      positionY: 0,
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    },
  },
};
