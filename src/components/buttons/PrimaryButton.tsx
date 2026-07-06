import type { ButtonHTMLAttributes } from "react";
import { theme } from "../../styles/theme";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export default function PrimaryButton({ className = "", children, ...props }: PrimaryButtonProps) {
  return (
    <button className={`${theme.primaryButton} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

