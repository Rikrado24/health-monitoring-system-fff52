import type { ButtonHTMLAttributes } from "react";

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export default function SecondaryButton({ className = "", children, ...props }: SecondaryButtonProps) {
  return (
    <button
      className={`w-full h-12 rounded-xl border border-emerald-300 text-emerald-700 font-semibold flex items-center justify-center gap-2 bg-white ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

