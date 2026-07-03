export type AppThemeId = "tokyo" | "obsidian" | "obsidian-light" | "ink";
export type AppThemePreset = { id: AppThemeId; name: string; description: string };
export type GraphThemeId = "obsidian" | "obsidian-light" | "tokyo" | "ink";
export type GraphThemePreset = {
  id: GraphThemeId;
  name: string;
  background: [string, string, string];
  star: string;
  starBright: string;
  file: string;
  struct: string;
  enum: string;
  producer: string;
  consumer: string;
  outgoing: string;
  incoming: string;
  reference: string;
  contains: string;
  flow: string;
  labelText: string;
  labelActive: string;
  selected: string;
  hovered: string;
};

export const APP_THEMES: AppThemePreset[] = [
  { id: "tokyo", name: "Tokyo Night", description: "沿用本地 Obsidian Tokyo Night 变量" },
  { id: "obsidian", name: "Obsidian Dark", description: "低饱和暗色，接近默认 Obsidian" },
  { id: "obsidian-light", name: "Obsidian Light", description: "默认 Obsidian 浅色风格，冷白灰底" },
  { id: "ink", name: "简墨", description: "中国风简洁浅色，宣纸底与朱砂强调" }
];

export const GRAPH_THEMES: GraphThemePreset[] = [
  {
    id: "obsidian",
    name: "Obsidian",
    background: ["rgba(22, 25, 31, 0.92)", "rgba(12, 14, 18, 0.99)", "rgba(6, 8, 11, 1)"],
    star: "rgba(164, 174, 188, 0.055)",
    starBright: "rgba(174, 186, 202, 0.13)",
    file: "#8b99ab",
    struct: "#d6dde8",
    enum: "#d6a84f",
    producer: "#43b7a7",
    consumer: "#8b7cf6",
    outgoing: "86, 188, 170",
    incoming: "229, 173, 85",
    reference: "172, 78, 74",
    contains: "104, 122, 151",
    flow: "86, 188, 170",
    labelText: "rgba(205, 214, 226, 0.9)",
    labelActive: "#f3f7ff",
    selected: "rgba(229, 173, 85, 0.58)",
    hovered: "rgba(168, 196, 236, 0.42)"
  },
  {
    id: "tokyo",
    name: "Tokyo",
    background: ["rgba(34, 43, 70, 0.82)", "rgba(18, 23, 38, 0.99)", "rgba(9, 12, 22, 1)"],
    star: "rgba(122, 162, 247, 0.065)",
    starBright: "rgba(187, 154, 247, 0.14)",
    file: "#7aa2f7",
    struct: "#c0caf5",
    enum: "#e0af68",
    producer: "#73daca",
    consumer: "#bb9af7",
    outgoing: "115, 218, 202",
    incoming: "224, 175, 104",
    reference: "247, 118, 142",
    contains: "86, 95, 137",
    flow: "115, 218, 202",
    labelText: "rgba(192, 202, 245, 0.9)",
    labelActive: "#ffffff",
    selected: "rgba(224, 175, 104, 0.62)",
    hovered: "rgba(122, 162, 247, 0.45)"
  },
  {
    id: "obsidian-light",
    name: "Obsidian Light",
    background: ["rgba(250, 251, 253, 0.98)", "rgba(239, 242, 247, 0.99)", "rgba(223, 229, 238, 1)"],
    star: "rgba(69, 86, 112, 0.035)",
    starBright: "rgba(69, 86, 112, 0.09)",
    file: "#6b7788",
    struct: "#2f3a4a",
    enum: "#ad7d2d",
    producer: "#2d8d7a",
    consumer: "#7867d8",
    outgoing: "45, 141, 122",
    incoming: "173, 125, 45",
    reference: "174, 76, 72",
    contains: "111, 124, 145",
    flow: "45, 141, 122",
    labelText: "rgba(35, 45, 60, 0.88)",
    labelActive: "#172033",
    selected: "rgba(173, 125, 45, 0.58)",
    hovered: "rgba(83, 112, 178, 0.34)"
  },
  {
    id: "ink",
    name: "简墨",
    background: ["rgba(238, 230, 211, 0.95)", "rgba(222, 211, 188, 0.98)", "rgba(199, 183, 151, 1)"],
    star: "rgba(68, 55, 43, 0.035)",
    starBright: "rgba(68, 55, 43, 0.09)",
    file: "#5d6d73",
    struct: "#203336",
    enum: "#b88439",
    producer: "#2f7d68",
    consumer: "#8a4a3c",
    outgoing: "47, 125, 104",
    incoming: "178, 75, 54",
    reference: "136, 61, 49",
    contains: "88, 98, 91",
    flow: "47, 125, 104",
    labelText: "rgba(31, 39, 37, 0.86)",
    labelActive: "#172522",
    selected: "rgba(178, 75, 54, 0.62)",
    hovered: "rgba(47, 125, 104, 0.38)"
  }
];

export function graphThemeForAppTheme(themeId: AppThemeId): GraphThemePreset {
  return GRAPH_THEMES.find((theme) => theme.id === themeId) ?? GRAPH_THEMES[0];
}
