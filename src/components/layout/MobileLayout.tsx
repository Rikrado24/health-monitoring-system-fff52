import type { ReactNode } from "react";
import { theme } from "../../styles/theme";

type MobileLayoutProps = {
  children: ReactNode;
  className?: string;
};

export default function MobileLayout({ children, className = "" }: MobileLayoutProps) {
  return (
    <section className={`${theme.page} ${className}`.trim()}>
      <div className={theme.container}>{children}</div>
    </section>
  );
}

