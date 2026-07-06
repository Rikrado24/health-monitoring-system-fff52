import type { ReactNode } from "react";
import { theme } from "../../styles/theme";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
};

export default function PageHeader({
  title,
  subtitle,
  rightSlot,
  className = "",
  titleClassName = "",
  subtitleClassName = "",
}: PageHeaderProps) {
  return (
    <header className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        <h2 className={`${theme.title} ${titleClassName}`.trim()}>{title}</h2>
        {subtitle ? <p className={`${theme.subtitle} ${subtitleClassName}`.trim()}>{subtitle}</p> : null}
      </div>
      {rightSlot ? <div className="w-full sm:w-auto sm:shrink-0">{rightSlot}</div> : null}
    </header>
  );
}
