import type { ThemeId } from "../themes";
import { themes } from "../themes";

type SettingsModalProps = {
  open: boolean;
  themeId: ThemeId;
  onClose: () => void;
  onThemeChange: (themeId: ThemeId) => void;
};

export function SettingsModal({ open, themeId, onClose, onThemeChange }: SettingsModalProps) {
  if (!open) return null;

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
        </div>
      </div>
    </div>
  );
}
