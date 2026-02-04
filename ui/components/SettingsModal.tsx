import type { CompareMode, CompareSpec } from "../types";
import type { ThemeId } from "../themes";
import { themes } from "../themes";

type SettingsModalProps = {
  open: boolean;
  themeId: ThemeId;
  compare: CompareSpec;
  compareOverridden: boolean;
  onClose: () => void;
  onThemeChange: (themeId: ThemeId) => void;
  onCompareChange: (compare: CompareSpec) => void;
  onCompareReset: () => void;
};

export function SettingsModal({
  open,
  themeId,
  compare,
  compareOverridden,
  onClose,
  onThemeChange,
  onCompareChange,
  onCompareReset,
}: SettingsModalProps) {
  if (!open) return null;

  const baseValue = compare.mode === "range" ? compare.base ?? "" : "";
  const headValue = compare.mode === "range" ? compare.head ?? "" : "";

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
              onCompareChange({ mode: "range", base: baseValue, head: headValue });
            }}
          >
            <option value="working">Working Tree</option>
            <option value="range">Branch Compare</option>
          </select>
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
