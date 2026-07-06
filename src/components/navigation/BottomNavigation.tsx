import { theme } from "../../styles/theme";

type BottomNavItem = {
  key: string;
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
};

type BottomNavigationProps = {
  items: BottomNavItem[];
  className?: string;
};

export default function BottomNavigation({ items, className = "" }: BottomNavigationProps) {
  return (
    <nav className={`${theme.bottomNav} ${className}`.trim()}>
      <div className="mx-auto w-full max-w-md px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2">
        <div className="no-scrollbar flex h-[74px] items-center gap-1.5 overflow-x-auto rounded-[26px] border border-white/70 bg-white/88 px-2 shadow-[0_24px_50px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className={`flex h-[58px] min-w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-[11px] font-semibold transition ${
              item.active
                ? "border-emerald-200 bg-[linear-gradient(180deg,#effaf4_0%,#dbf4e5_100%)] text-emerald-700 shadow-[0_14px_28px_-20px_rgba(5,150,105,0.55)]"
                : "border-transparent text-slate-500"
            }`}
            aria-label={item.label}
          >
            <div
              className={`grid h-8 w-8 place-items-center rounded-full transition ${
                item.active ? "bg-white text-emerald-700 shadow-sm" : "bg-transparent text-slate-400"
              }`}
            >
              <i className={`fa-solid ${item.icon} text-[14px]`} />
            </div>
            <span className="leading-none">{item.label}</span>
          </button>
        ))}
        </div>
      </div>
    </nav>
  );
}
