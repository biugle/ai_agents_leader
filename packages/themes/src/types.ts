export interface LightColors {
  color: string;
  glow: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: {
    background: string;
    surface: string;
    surfaceHover: string;
    text: string;
    textMuted: string;
    border: string;
  };
  lights: {
    thinking: LightColors;
    running: LightColors;
    success: LightColors;
    alert: LightColors;
    waiting: LightColors;
    stalled: LightColors;
    idle: LightColors;
  };
  pod: {
    borderRadius: string;
    backdropBlur: string;
    shadow: string;
  };
  animation: {
    pulseSpeed: number;    // seconds for one breath cycle
    flowSpeed: number;     // seconds for one light to travel
    strobeSpeed: number;   // seconds per flash
    breathSpeed: number;   // seconds for idle breath
  };
}
