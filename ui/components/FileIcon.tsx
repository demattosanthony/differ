import { chooseIconName } from "../utils/fileIcons";

type FileIconProps = {
  path: string;
  type: "file" | "directory";
  expanded?: boolean;
  className?: string;
};

export function FileIcon({
  path,
  type,
  expanded = false,
  className,
}: FileIconProps) {
  const iconName = chooseIconName(path, type, expanded);
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={`#${iconName}`} />
    </svg>
  );
}
