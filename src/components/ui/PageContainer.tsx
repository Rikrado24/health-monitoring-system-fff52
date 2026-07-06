import type { HTMLAttributes } from "react";
import { theme } from "../../styles/theme";

type PageContainerProps = HTMLAttributes<HTMLDivElement>;

export default function PageContainer({ className = "", children, ...props }: PageContainerProps) {
  return (
    <div className={`${theme.container} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
