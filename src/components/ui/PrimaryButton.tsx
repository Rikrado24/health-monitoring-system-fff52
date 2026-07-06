import type { ButtonHTMLAttributes } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export default function PrimaryButton({ className = "", children, ...props }: PrimaryButtonProps) {
  return (
    <button
      className={`w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

