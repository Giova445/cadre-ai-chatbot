// Frozen interface contracts shared across every module.
// Changing any of these is a coordinated change, not a local one.

export type ChunkMeta = {
  source: string; // KB filename, e.g. "services.md"
  title: string; // frontmatter title
  section: string; // heading the chunk came from
  tags: string[];
};

export type Chunk = {
  id: string; // `${source}#${index}`
  text: string; // chunk body, prefixed with "title | section"
  embedding: number[]; // length === dimensions
  meta: ChunkMeta;
};

export type EmbeddingsFile = {
  model: string; // e.g. "text-embedding-3-small" or "lexical-hash-512"
  dimensions: number; // 512
  builtAt: string; // ISO timestamp
  thresholdHint: number; // calibrated cosine cutoff suggestion for this embedder
  chunks: Chunk[];
};

export type Retrieved = { chunk: Chunk; score: number }; // score = cosine similarity

export type ChatRole = "user" | "assistant";
export type HistoryMessage = { role: ChatRole; content: string };

// Golden-set eval contract.
export type GoldenExpect = "grounded" | "refuse" | "escalate";
export type GoldenCase = {
  id: string;
  question: string;
  expect: GoldenExpect;
  mustCite?: string[]; // KB source filenames the answer must be grounded in
  mustNotSay?: string[]; // substrings that MUST NOT appear (case-insensitive)
};
