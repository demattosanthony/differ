import { useEffect, useState } from "react";

type GitHubUser = { login: string } | null;

export function useGitHubUser(token: string | null) {
  const [user, setUser] = useState<GitHubUser>(null);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let active = true;
    fetch("/api/github/user", { headers: { "x-github-token": token } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (active) setUser(data);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return user;
}
