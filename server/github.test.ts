import { describe, expect, test } from "bun:test";
import { parseGitHubRemoteUrl } from "./github";

describe("parseGitHubRemoteUrl", () => {
  test("parses HTTPS GitHub remotes", () => {
    expect(parseGitHubRemoteUrl("https://github.com/demattosanthony/differ.git")).toEqual({
      owner: "demattosanthony",
      name: "differ",
    });
  });

  test("parses SSH GitHub remotes", () => {
    expect(parseGitHubRemoteUrl("git@github.com:demattosanthony/differ.git")).toEqual({
      owner: "demattosanthony",
      name: "differ",
    });
  });

  test("ignores non-GitHub remotes", () => {
    expect(parseGitHubRemoteUrl("https://gitlab.com/demattosanthony/differ.git")).toBeNull();
  });
});
