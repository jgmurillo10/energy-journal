export type Mood = "good" | "neutral" | "bad";

export type Trigger = {
  label: string;
  category: string;
  polarity: "positive" | "negative";
  evidence: string;
};

export type ProfileField = "name" | "gender" | "enjoys";

/** How a stored value was produced from the transcript. */
export type ExtractionMethod = "local-llm" | "rules" | "user";

/** What was actually said, kept next to the cleaned value shown in the UI. */
export type RawAnswers = Record<ProfileField, string>;

export type Profile = {
  name: string;
  gender: string;
  enjoys: string;
  first_day: string;
  created_at: string;
  raw?: RawAnswers;
  methods?: Partial<Record<ProfileField, ExtractionMethod>>;
};

export type AuditEvent = {
  id: number;
  at: string;
  field: ProfileField | "profile";
  before: string;
  after: string;
  method: ExtractionMethod;
  /** The transcript the value came from, when there was one. */
  transcript?: string;
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
  /** Which analyser produced the mood, battery and triggers. */
  analyzed_by?: string;
};
