export type Mood = "good" | "neutral" | "bad";

export type Trigger = {
  label: string;
  category: string;
  polarity: "positive" | "negative";
  evidence: string;
};

/** What was actually said, kept next to the cleaned value shown in the UI. */
export type RawAnswers = {
  name: string;
  gender: string;
  enjoys: string;
};

export type Profile = {
  name: string;
  gender: string;
  enjoys: string;
  first_day: string;
  created_at: string;
  raw?: RawAnswers;
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
