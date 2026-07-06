import type { ButtonHTMLAttributes } from "react";
import { theme } from "../../styles/theme";

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export default function SecondaryButton({ className = "", children, ...props }: SecondaryButtonProps) {
  return (
    <button className={`${theme.secondaryButton} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

