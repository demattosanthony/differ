export type ReviewUser = {
  login: string;
  avatarUrl: string;
};

export type ReviewComment = {
  id: number;
  body: string;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT";
  startLine?: number | null;
  startSide?: "LEFT" | "RIGHT" | null;
  inReplyToId?: number | null;
  createdAt: string;
  user: ReviewUser;
};

export type ReviewThread = {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT";
  comments: ReviewComment[];
};
