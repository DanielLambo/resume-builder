"use client";

import { Toaster } from "sonner";

export function ToasterProvider() {
  return (
    <Toaster
      theme="light"
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "border border-studio-border bg-studio-paper text-studio-ink shadow-floating-bar font-sans",
        },
      }}
    />
  );
}
