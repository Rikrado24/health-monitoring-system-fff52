export const theme = {
  page: "min-h-screen bg-[#F8FAF7] px-3 py-4 pb-24 sm:px-4 sm:py-5 lg:px-6 xl:px-8",
  container: "mx-auto w-full max-w-md space-y-4 sm:space-y-5 md:max-w-5xl lg:max-w-6xl xl:max-w-7xl",
  card: "w-full min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5",
  primaryButton:
    "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white sm:h-12 sm:text-base",
  secondaryButton:
    "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 text-sm font-semibold text-emerald-700 sm:h-12 sm:text-base",
  title: "text-lg font-bold text-gray-900 sm:text-xl lg:text-2xl",
  subtitle: "mt-1 text-xs text-gray-500 sm:text-sm",
  sectionTitle: "text-base font-semibold text-gray-900 sm:text-lg",
  bottomNav: "fixed bottom-0 left-0 right-0 z-50",
} as const;
