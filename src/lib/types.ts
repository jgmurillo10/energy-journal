export type Mood = "good" | "neutral" | "bad";

export type Trigger = {
  label: string;
  category: string;
  polarity: "positive" | "negative";
  evidence: string;
};

export type Profile = {
  name: string;
  gender: string;
  enjoys: string;
  first_day: string;
  created_at: string;
};

export type Entry = {
  id: number;
  created_at: string;
  text: string;
  source: string;
  mood: Mood;
  sentiment: number;
  energy: number;
  battery: number;
  triggers: Trigger[];
};
