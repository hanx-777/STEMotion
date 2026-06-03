'use client';

import { useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type Toast as ToastType } from '@/lib/stores/toastStore';
import { gsap } from 'gsap';

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function Toast({ toast }: { toast: ToastType }) {
  const removeToast = useToastStore((state) => state.removeToast);
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (toastRef.current) {
      gsap.fromTo(
        toastRef.current,
        { x: 400, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, []);

  const handleClose = () => {
    if (toastRef.current) {
      gsap.to(toastRef.current, {
        x: 400,
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => removeToast(toast.id),
      });
    }
  };

  const config = getToastConfig(toast.type);

  return (
    <div
      ref={toastRef}
      className={`pointer-events-auto flex min-w-[320px] items-start gap-3 rounded-lg border p-4 shadow-lg ${config.className}`}
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <config.Icon size={20} className="mt-0.5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={handleClose}
        className="flex-shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        aria-label="关闭通知"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function getToastConfig(type: ToastType['type']) {
  switch (type) {
    case 'success':
      return {
        Icon: CheckCircle,
        className: 'border-teal-200 bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]',
      };
    case 'error':
      return {
        Icon: AlertCircle,
        className: 'border-red-200 bg-red-50 text-red-700',
      };
    case 'warning':
      return {
        Icon: AlertTriangle,
        className: 'border-amber-200 bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]',
      };
    case 'info':
      return {
        Icon: Info,
        className: 'border-blue-200 bg-blue-50 text-blue-700',
      };
  }
}
