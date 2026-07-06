import React from "react";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Terjadi kesalahan saat memuat aplikasi.",
    };
  }

  override componentDidCatch(error: Error) {
    console.error("App error boundary caught:", error);
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-mobile min-h-screen bg-[#F8FAF7] px-4 py-5 pb-24">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center rounded-[22px] border border-[#ead6aa] bg-white/90 p-6 text-center shadow-[0_25px_70px_-28px_rgba(117,80,19,0.35)]">
          <div>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-rose-50 text-rose-700">
              <i className="fa-solid fa-triangle-exclamation text-2xl" />
            </div>
            <p className="text-base font-bold text-slate-800">Aplikasi gagal dimuat</p>
            <p className="mt-2 text-sm text-slate-500">
              Coba refresh halaman. Jika masih putih, ada error runtime di browser.
            </p>
            <p className="mt-3 break-words text-xs text-slate-400">{this.state.errorMessage}</p>
          </div>
        </div>
      </main>
    );
  }
}
