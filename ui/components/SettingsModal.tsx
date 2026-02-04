import type { CompareMode, CompareSpec } from "../types";
import type { ThemeId } from "../themes";
import { themes } from "../themes";

type SettingsModalProps = {
  open: boolean;
  themeId: ThemeId;
  compare: CompareSpec;
  compareOverridden: boolean;
  githubToken: string;
  prNumber: number;
  onClose: () => void;
  onThemeChange: (themeId: ThemeId) => void;
  onCompareChange: (compare: CompareSpec) => void;
  onGitHubTokenChange: (value: string) => void;
  onPrNumberChange: (value: number) => void;
  onCompareReset: () => void;
};

export function SettingsModal({
  open,
  themeId,
  compare,
  compareOverridden,
  githubToken,
  prNumber,
  onClose,
  onThemeChange,
  onCompareChange,
  onGitHubTokenChange,
  onPrNumberChange,
  onCompareReset,
}: SettingsModalProps) {
  if (!open) return null;

  const baseValue = compare.mode === "range" ? compare.base ?? "" : "";
  const headValue = compare.mode === "range" ? compare.head ?? "" : "";
  const prValue = compare.mode === "pr" ? compare.number : prNumber;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <label className="settings-label" htmlFor="theme-select">
            Theme
          </label>
          <select
            id="theme-select"
            className="settings-select"
            value={themeId}
            onChange={(event) => onThemeChange(event.target.value as ThemeId)}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
          <label className="settings-label" htmlFor="compare-select">
            Compare
          </label>
          <select
            id="compare-select"
            className="settings-select"
            value={compare.mode}
            onChange={(event) => {
              const mode = event.target.value as CompareMode;
              if (mode === "working") {
                onCompareChange({ mode: "working" });
                return;
              }
              if (mode === "pr") {
                if (prValue > 0) onCompareChange({ mode: "pr", number: prValue });
                return;
              }
              onCompareChange({ mode: "range", base: baseValue, head: headValue });
            }}
          >
            <option value="working">Working Tree</option>
            <option value="range">Branch Compare</option>
            <option value="pr">Pull Request</option>
          </select>
          <label className="settings-label" htmlFor="compare-pr">
            Pull Request
          </label>
          <input
            id="compare-pr"
            className="settings-input"
            placeholder="123"
            value={prValue || ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              onPrNumberChange(Number.isFinite(next) ? next : 0);
              if (compare.mode === "pr") {
                onCompareChange({ mode: "pr", number: Number.isFinite(next) ? next : 0 });
              }
            }}
          />
          <div className="settings-help">Enter a PR number, then select Pull Request.</div>
          <label className="settings-label" htmlFor="compare-base">
            Base
          </label>
          <input
            id="compare-base"
            className="settings-input"
            placeholder="origin/HEAD"
            value={baseValue}
            onChange={(event) => onCompareChange({ mode: "range", base: event.target.value, head: headValue })}
            disabled={compare.mode !== "range"}
          />
          <label className="settings-label" htmlFor="compare-head">
            Head
          </label>
          <input
            id="compare-head"
            className="settings-input"
            placeholder="HEAD"
            value={headValue}
            onChange={(event) => onCompareChange({ mode: "range", base: baseValue, head: event.target.value })}
            disabled={compare.mode !== "range"}
          />
          <div className="settings-help">Leave base/head blank to use the repo defaults.</div>
          <label className="settings-label" htmlFor="github-token">
            GitHub Token
          </label>
          <input
            id="github-token"
            className="settings-input"
            type="password"
            placeholder="ghp_..."
            value={githubToken}
            onChange={(event) => onGitHubTokenChange(event.target.value)}
          />
          <div className="settings-help">
            Token needs pull request read/write permissions to review and mark files as viewed.
          </div>
          {compareOverridden ? (
            <button type="button" className="settings-reset" onClick={onCompareReset}>
              Use repo default
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
