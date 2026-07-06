import type { HTMLAttributes } from "react";
import { theme } from "../../styles/theme";

type AppCardProps = HTMLAttributes<HTMLElement>;

export default function AppCard({ className = "", children, ...props }: AppCardProps) {
  return (
    <article className={`${theme.card} ${className}`.trim()} {...props}>
      {children}
    </article>
  );
}
